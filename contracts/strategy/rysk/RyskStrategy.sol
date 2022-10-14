// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
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

    // number of decimal places of a Liquidity Pool share (ERC20)
    uint256 constant SHARES_CONVERSION_FACTOR = 1e18;
    uint256 immutable underlyingDecimals;

    /**
     * Emmited when a withdrawal has been initiated.
     *
     * @param amount to be withdrawn
     */
    event StrategyWithdrawalInitiated(uint256 amount);

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
        address _keeper,
        address _ryskLiquidityPool,
        IERC20 _underlying
    ) BaseStrategy(_vault, _underlying, _admin) {
        if (_ryskLiquidityPool == address(0))
            revert RyskLiquidityPoolCannotBe0Address();
        if (_keeper == address(0)) revert StrategyKeeperCannotBe0Address();

        ryskLqPool = IRyskLiquidityPool(_ryskLiquidityPool);

        underlying.safeIncreaseAllowance(_ryskLiquidityPool, type(uint256).max);
        underlyingDecimals = IERC20Metadata(address(_underlying)).decimals();

        _grantRole(KEEPER_ROLE, _keeper);
    }

    //
    // IStrategy
    //

    /// @inheritdoc IStrategy
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
        if (_getSharesBalance() != 0) return true;

        IRyskLiquidityPool.DepositReceipt
            memory depositReceipt = _getDepositReceipt();

        if (depositReceipt.amount != 0 || depositReceipt.unredeemedShares != 0)
            return true;

        IRyskLiquidityPool.WithdrawalReceipt
            memory withdrawalReceipt = _getWithdrawalReceipt();

        return withdrawalReceipt.shares != 0;
    }

    /// @inheritdoc IStrategy
    /// @notice this also includes shares from the pending withdrawal and shares yet to be minted for pending deposits
    function investedAssets()
        public
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        IRyskLiquidityPool.DepositReceipt
            memory depositReceipt = _getDepositReceipt();
        IRyskLiquidityPool.WithdrawalReceipt
            memory withdrawalReceipt = _getWithdrawalReceipt();
        uint256 currentWithdrawalEpoch = ryskLqPool.withdrawalEpoch();
        // since withdrawal price per share is not updated until the end of the epoch,
        // we need to use the price per share from the previous epoch
        uint256 currentWithdrawalPricePerShare = ryskLqPool
            .withdrawalEpochPricePerShare(ryskLqPool.withdrawalEpoch() - 1);

        // shares for pending deposit (not yet minted or not yet updated on the deposit receipt as unredeemed)
        uint256 amountInPendingDepositShares = _getAmountInSharesForPendingDeposit(
                depositReceipt,
                currentWithdrawalPricePerShare
            );

        // shares marked for withdrawal that are now owned by the pool itself
        uint256 amountInPendingWithdrawalShares = 0;
        if (withdrawalReceipt.epoch != 0) {
            if (withdrawalReceipt.epoch == currentWithdrawalEpoch) {
                amountInPendingWithdrawalShares = _sharesToUnderlying(
                    withdrawalReceipt.shares,
                    currentWithdrawalPricePerShare
                );
            } else {
                amountInPendingWithdrawalShares = _sharesToUnderlying(
                    withdrawalReceipt.shares,
                    ryskLqPool.withdrawalEpochPricePerShare(
                        withdrawalReceipt.epoch
                    )
                );
            }
        }

        // unredeemed shares are not counted in the strategy's balance
        // because they are not yet claimed (they are still owned by the pool)
        uint256 amountInUnredeemedShares = _sharesToUnderlying(
            depositReceipt.unredeemedShares,
            currentWithdrawalPricePerShare
        );

        // redeemed shares that are owned by the strategy
        uint256 amountInRedeemedShares = _sharesToUnderlying(
            _getSharesBalance(),
            currentWithdrawalPricePerShare
        );

        return
            amountInPendingDepositShares +
            amountInPendingWithdrawalShares +
            amountInUnredeemedShares +
            amountInRedeemedShares;
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

        uint256 withdrawalEpoch = ryskLqPool.withdrawalEpoch();
        _checkPendingWithdrawal(withdrawalEpoch);

        // since withdrawal price per share is not updated until the end of the epoch,
        // we need to use the price per share from the previous epoch
        uint256 withdrawalPricePerShare = ryskLqPool
            .withdrawalEpochPricePerShare(withdrawalEpoch - 1);

        uint256 sharesToWithdraw = _calculateSharesNeededToWithdraw(
            _amount,
            withdrawalPricePerShare
        );

        emit StrategyWithdrawalInitiated(_amount);
        ryskLqPool.initiateWithdraw(sharesToWithdraw);
    }

    /**
     * Completes the pending withdrawal initiated in an earlier epoch.
     *
     * @notice Expected to be called by the backend (keeper bot) once the Rysk liquidity pool enters a new withdrawal epoch.
     * The backend should track the 'WithdrawalEpochExecuted' event on the Rysk LiquidityPool contract,
     * and act by calling this function when the event is emitted to complete pending withdrawal.
     */
    function completeWithdrawal() external onlyKeeper {
        IRyskLiquidityPool.WithdrawalReceipt
            memory withdrawalReceipt = _getWithdrawalReceipt();

        if (withdrawalReceipt.epoch == 0) revert RyskNoWithdrawalInitiated();
        if (withdrawalReceipt.epoch == ryskLqPool.withdrawalEpoch())
            revert RyskCannotCompleteWithdrawalInSameEpoch();

        uint256 amountWithdrawn = ryskLqPool.completeWithdraw();

        emit StrategyWithdrawn(amountWithdrawn);
        underlying.safeTransfer(vault, amountWithdrawn);
    }

    /**
     * Used in the investedAssets() to get the amount of underlying as shares we would receive for making a deposit since shares are not minted immediately.
     * Shares are minted in the next deposit epoch, but are owned by the pool and deposit receipt property 'unredeemedShares' is not updated at that point.
     * For the deposit receipt to be updated with the actual count of unredeemed shares from the past epochs,
     * the strategy has to interact with the Rysk liquidity pool by either depositing, withdrawing or redeeming.
     * This is why we rely on the deposit receipt epoch and price per share properties to calculate the amount of shares we would receive for that deposit.
     *
     * @param _depositReceipt the deposit receipt
     * @param _withdrawalPricePerShare price per share for the withdrawal epoch
     *
     * @return amount of underlying expressed as pending shares * @param _pricePerShare
     */
    function _getAmountInSharesForPendingDeposit(
        IRyskLiquidityPool.DepositReceipt memory _depositReceipt,
        uint256 _withdrawalPricePerShare
    ) internal view returns (uint256) {
        if (_depositReceipt.epoch == 0 || _depositReceipt.amount == 0) return 0;

        if (_depositReceipt.epoch == ryskLqPool.depositEpoch()) {
            return _depositReceipt.amount;
        }

        uint256 depositPricePerShare = ryskLqPool.depositEpochPricePerShare(
            _depositReceipt.epoch
        );

        uint256 pendingDepositShares = _underlyingToShares(
            _depositReceipt.amount,
            depositPricePerShare
        );

        return
            _sharesToUnderlying(pendingDepositShares, _withdrawalPricePerShare);
    }

    /**
     * Calculates the amount of shares for provided amount of underlying and price per share.
     *
     * @param _underlying amount of underlying
     * @param _pricePerShare price per share
     *
     * @return number of shares
     */
    function _underlyingToShares(uint256 _underlying, uint256 _pricePerShare)
        internal
        view
        returns (uint256)
    {
        return ((((_underlying * SHARES_CONVERSION_FACTOR) / _pricePerShare) *
            SHARES_CONVERSION_FACTOR) / 10**underlyingDecimals);
    }

    /**
     * Calculates the amount of underlying for provided number of Rysk liquidity pool shares and price per share.
     *
     * @param _shares number of shares in e18 decimals
     * @param _pricePerShare price per share i e18 decimals
     *
     * @return amount of underlying
     */
    function _sharesToUnderlying(uint256 _shares, uint256 _pricePerShare)
        internal
        view
        returns (uint256)
    {
        return
            (((_shares * 10**underlyingDecimals) / SHARES_CONVERSION_FACTOR) *
                _pricePerShare) / SHARES_CONVERSION_FACTOR;
    }

    /**
     * Checks if there is a pending withdrawal from an earlier epoch.
     * Rysk liquidity pool doesn't allow to initiate another withdrawal if a pending withdrawal from older epoch was not completed.
     *
     * @notice reverts if there is a pending withdrawal from an earlier epoch
     *
     * @param _currentWithdrawalEpoch withdrawal epoch
     */
    function _checkPendingWithdrawal(uint256 _currentWithdrawalEpoch)
        internal
        view
    {
        IRyskLiquidityPool.WithdrawalReceipt
            memory withdrawalReceipt = _getWithdrawalReceipt();

        if (
            withdrawalReceipt.epoch != 0 &&
            withdrawalReceipt.epoch != _currentWithdrawalEpoch
        ) revert RyskPendingWithdrawalNotCompleted();
    }

    /**
     * Gets the amount of shares needed to withdraw the specified amount of underlying.
     *
     * @notice reverts if the amount of shares needed is greater than the amount of shares available
     *
     * @param _amount amount of underlying to withdraw
     * @param _pricePerShare price per share
     *
     * @return shares needed to withdraw the specified amount of underlying
     */
    function _calculateSharesNeededToWithdraw(
        uint256 _amount,
        uint256 _pricePerShare
    ) internal returns (uint256) {
        uint256 sharesBalance = _getSharesBalance();
        uint256 sharesNeeded = _underlyingToShares(_amount, _pricePerShare);

        if (sharesNeeded > sharesBalance) {
            // try to redeem any unredeemed shares
            uint256 redeemedShares = ryskLqPool.redeem(type(uint256).max);

            if (sharesBalance + redeemedShares < sharesNeeded)
                revert StrategyNotEnoughShares();
        }

        sharesBalance = _getSharesBalance();

        return sharesNeeded;
    }

    /**
     * Gets the withdrawal receipt for the strategy.
     *
     * @return withdrawal receipt
     */
    function _getWithdrawalReceipt()
        internal
        view
        returns (IRyskLiquidityPool.WithdrawalReceipt memory)
    {
        return ryskLqPool.withdrawalReceipts(address(this));
    }

    /**
     * Gets the deposit receipt for the strategy.
     *
     * @return deposit receipt
     */
    function _getDepositReceipt()
        internal
        view
        returns (IRyskLiquidityPool.DepositReceipt memory)
    {
        return ryskLqPool.depositReceipts(address(this));
    }

    /**
     * Gets the amount of shares owned by the strategy.
     *
     * @return amount of shares
     */
    function _getSharesBalance() internal view returns (uint256) {
        return ryskLqPool.balanceOf(address(this));
    }
}
