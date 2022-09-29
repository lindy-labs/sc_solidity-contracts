// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PercentMath} from "../../lib/PercentMath.sol";
import {ERC165Query} from "../../lib/ERC165Query.sol";
import {IStrategy} from "../IStrategy.sol";
import {BaseStrategy} from "../BaseStrategy.sol";
import {IRyskLiquidityPool} from "../../interfaces/rysk/IRyskLiquidityPool.sol";
import {IVault} from "../../vault/IVault.sol";

/**
 * RyskStrategy generates yield by investing into a Rysk LiquidityPool,
 * that serves to provide liquidity for a dynamic hedging options AMM.
 *
 * @notice This strategy is asyncrhonous (doesn't support immediate withdrawals).
 *
 */
contract RyskStrategy is BaseStrategy {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;

    // rysk liquidity pool that this strategy is interacting with
    IRyskLiquidityPool public immutable ryskLqPool;
    // pending withdrawal receipt
    IRyskLiquidityPool.WithdrawalReceipt public pendingWithdrawal;

    // number of decimal places of a Liquidity Pool share (ERC20)
    uint256 constant SHARES_CONVERSION_FACTOR = 1e18;

    /**
     * Emmited when a withdrawal has been initiated.
     *
     *@param amount to be withdrawn
     */
    event RyskWithdrawalInitiated(uint256 amount);

    // rysk liquidity pool cannot be 0 address
    error RyskLiquidityPoolCannotBe0Address();
    // no withdrawal initiated
    error RyskNoWithdrawalInitiated();
    // cannot complete withdrawal in the same epoch
    error RyskCannotCompleteWithdrawalInSameEpoch();
    // cannot initiate a withdrawal before a pending withdrawal is completed
    error RyskPendingWithdrawalNotCompleted();

    /**
     * @param _vault address of the vault that will use this strategy
     * @param _admin address of the administrator account for this strategy
     * @param _ryskLiquidityPool address of the rysk liquidity pool that this strategy is using
     * @param _underlying address of the underlying token
     */
    constructor(
        address _vault,
        address _admin,
        address _ryskLiquidityPool,
        IERC20 _underlying
    ) BaseStrategy(_vault, _underlying, _admin) {
        if (_ryskLiquidityPool == address(0))
            revert RyskLiquidityPoolCannotBe0Address();

        ryskLqPool = IRyskLiquidityPool(_ryskLiquidityPool);

        underlying.safeIncreaseAllowance(_ryskLiquidityPool, type(uint256).max);
    }

    //
    // IStrategy
    //

    /**
     * Rysk strategy is asynchronous meaning it doesn't support immediate withdrawals.
     *
     * @return false always
     */
    function isSync() external pure override(IStrategy) returns (bool) {
        return false;
    }

    /// @inheritdoc IStrategy
    function hasAssets()
        external
        view
        virtual
        override(IStrategy)
        returns (bool)
    {
        // TODO: refactor & test
        if (
            pendingWithdrawal.shares != 0 ||
            ryskLqPool.balanceOf(address(this)) != 0
        ) return true;

        return ryskLqPool.depositReceipts(address(this)).epoch != 0;
    }

    /// @inheritdoc IStrategy

    // TODO: has to redeem before calculating assets!!!
    /// @notice this also includes shares from the pending withdrawal
    function investedAssets()
        public
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        IRyskLiquidityPool.DepositReceipt memory depositReceipt = ryskLqPool
            .depositReceipts(address(this));
        uint256 currentPricePerShare = _getWithdrawalPricePerShare();

        // shares yet to be minted for pending deposits
        uint256 pendingSharesAmount = 0;
        if (depositReceipt.epoch != 0) {
            uint256 depositPricePerShare = ryskLqPool.depositEpochPricePerShare(
                depositReceipt.epoch
            );

            pendingSharesAmount =
                (((depositReceipt.amount * SHARES_CONVERSION_FACTOR) /
                    depositPricePerShare) * currentPricePerShare) /
                SHARES_CONVERSION_FACTOR;
        }

        // shares marked by initiated withdrawal (now owned by the pool itself)
        uint256 withdrawalSharesAmount = (pendingWithdrawal.shares *
            ryskLqPool.withdrawalEpochPricePerShare(pendingWithdrawal.epoch)) /
            SHARES_CONVERSION_FACTOR;

        // entitled = redeemed + unredeemed
        uint256 entitledSharesAmount = ((depositReceipt.unredeemedShares +
            ryskLqPool.balanceOf(address(this))) * currentPricePerShare) /
            SHARES_CONVERSION_FACTOR;

        return
            pendingSharesAmount + withdrawalSharesAmount + entitledSharesAmount;
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        uint256 balance = underlying.balanceOf(address(this));

        if (balance == 0) revert StrategyNoUnderlying();

        emit StrategyInvested(balance);
        ryskLqPool.deposit(balance);
    }

    /// @inheritdoc IStrategy
    function withdrawToVault(uint256 _amount)
        external
        virtual
        override(IStrategy)
        onlyManager
    {
        if (_amount == 0) revert StrategyAmountZero();
        if (_amount > investedAssets()) revert StrategyNotEnoughShares();

        _initializePendingWithdrawal();

        uint256 sharesToWithdraw = _underlyingToShares(_amount);
        pendingWithdrawal.shares += uint128(sharesToWithdraw);

        emit RyskWithdrawalInitiated(_amount);
        ryskLqPool.initiateWithdraw(sharesToWithdraw);
    }

    /**
     * Completes the pending withdrawal initiated in an earlier epoch.
     *
     * @notice Expected to be called by the backend (keeper bot) once the Rysk liquidity pool enters a new withdrawal epoch.
     * The backend should subscribe to 'WithdrawalEpochExecuted' event on the Rysk LiquidityPool contract,
     * and act by calling this function when the event is emitted to complete pending withdrawal.
     */
    function completeWithdrawal() external {
        if (pendingWithdrawal.epoch == 0) revert RyskNoWithdrawalInitiated();
        if (pendingWithdrawal.epoch == ryskLqPool.withdrawalEpoch())
            revert RyskCannotCompleteWithdrawalInSameEpoch();

        uint256 amountWithdrawn = ryskLqPool.completeWithdraw(
            pendingWithdrawal.shares
        );

        delete pendingWithdrawal;

        emit StrategyWithdrawn(amountWithdrawn);
        underlying.safeTransfer(vault, amountWithdrawn);
    }

    /**
     * Get the number of Rysk liquidity pool shares owned by the strategy.
     *
     * @return shares owned by the strategy including unredeemed shares and shares yet to be minted for pending deposits
     */
    // function _getTotalShares() internal view returns (uint256) {
    //     IRyskLiquidityPool.DepositReceipt memory depositReceipt = ryskLqPool
    //         .depositReceipts(address(this));

    //     uint256 pendingShares = 0;
    //     if (depositReceipt.amount != 0) {
    //         (depositReceipt.amount * 1e18) /
    //             ryskLqPool.depositEpochPricePerShare(depositReceipt.epoch);
    //     }

    //     // total shares = redeemed shares + unredeemed shares
    //     return
    //         // we also need to take into account the pending deposit amount
    //         // for which shares are not minted yet nor they are redeemed
    //         // shares are minted when new epoch starts
    //         pendingShares +
    //         depositReceipt.unredeemedShares +
    //         ryskLqPool.balanceOf(address(this)) +
    // }

    /**
     * Get the price per share of the Rysk liquidity pool.
     *
     * @return price per share
     */
    function _getWithdrawalPricePerShare() internal view returns (uint256) {
        return
            ryskLqPool.withdrawalEpochPricePerShare(
                ryskLqPool.withdrawalEpoch()
            );
    }

    /**
     * Calculates the amount of underlying in number of Rysk liquidity pool shares.
     *
     * @param _underlying amount of underlying
     *
     * @return number of shares
     */
    function _underlyingToShares(uint256 _underlying)
        internal
        view
        returns (uint256)
    {
        return
            (_underlying * SHARES_CONVERSION_FACTOR) /
            _getWithdrawalPricePerShare();
    }

    /**
     * Initializes the cached pending withdrawal receipt field.
     */
    function _initializePendingWithdrawal() internal {
        uint256 currentEpoch = ryskLqPool.withdrawalEpoch();

        if (pendingWithdrawal.epoch == 0) {
            // there is no pending withdrawal so we can initialize a new one
            pendingWithdrawal.epoch = uint128(currentEpoch);
            return;
        }

        // the pending withdrawal receipt is already initialized for the current withdrawal epoch
        if (pendingWithdrawal.epoch == currentEpoch) return;

        // rysk liquidity pool doesn't allow for a withdrawal to be initiated in a new epoch
        // when a pending withdrawal from a previous epoch isn't completed
        revert RyskPendingWithdrawalNotCompleted();
    }
}
