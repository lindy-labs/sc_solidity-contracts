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
 * @dev A few notes on the Rysk Liquidity Poll deposit/withdrawal mechanism:
 * 1.
 */
contract RyskStrategy is BaseStrategy {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;

    // rysk liquidity pool that this strategy is interacting with
    IRyskLiquidityPool public immutable ryskLqPool;
    // pending withdrawal receipt
    IRyskLiquidityPool.WithdrawalReceipt public pendingWithdrawal;

    // number of decimal places for LiquidityPool share (ERC20)
    uint256 constant SHARES_CONVERSION_FACTOR = 1e18;

    /**
     * Emmited when a withdrawal has been initiated.
     *
     *@param shares to be withdrawn
     */
    event RyskWithdrawalInitiated(uint256 shares);

    // rysk liquidity pool cannot be 0 address
    error RyskLiquidityPoolCannotBe0Address();
    // no withdrawal initiated
    error RyskNoWithdrawalInitiated();
    // cannot complete withdrawal in the same epoch
    error RyskCannotCompleteWithdrawalInSameEpoch();
    // cannot initiate a withdrawal before pending withdrawal is completed
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
        return _getTotalShares() != 0;
    }

    /// @inheritdoc IStrategy
    function investedAssets()
        external
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        return
            (_getTotalShares() *
                ryskLqPool.withdrawalEpochPricePerShare(
                    ryskLqPool.withdrawalEpoch()
                )) / SHARES_CONVERSION_FACTOR;
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

        uint256 currentEpoch = ryskLqPool.withdrawalEpoch();

        if (pendingWithdrawal.epoch == 0) {
            pendingWithdrawal.epoch = uint128(currentEpoch);
        } else if (pendingWithdrawal.epoch != currentEpoch) {
            // rysk liquidity pool doesn't allow a withdrawal to be initiated in a new epoch
            // if a pending withdrawal from a previous epoch isn't completed
            revert RyskPendingWithdrawalNotCompleted();
        }

        uint256 sharesToWithdraw = _underlyingToShares(_amount);

        if (!_hasEnoughSharesToWithdraw(sharesToWithdraw))
            revert StrategyNotEnoughShares();

        pendingWithdrawal.shares += uint128(sharesToWithdraw);

        emit RyskWithdrawalInitiated(sharesToWithdraw);
        ryskLqPool.initiateWithdraw(sharesToWithdraw);
    }

    /**
     * Completes the pending withdrawal initiated in an earlier epoch.
     *
     * @notice Expected to be called by the backend once the Rysk liquidity pool enters a new withdrawal epoch.
     * Backend should subscribe to 'WithdrawalEpochExecuted' event on the Rysk LiquidityPool contract,
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
     * @return shares owned by the strategy including unredeemed shares
     */
    function _getTotalShares() internal view returns (uint256) {
        // total shares = redeemed shares + unredeemed shares
        return
            ryskLqPool.balanceOf(address(this)) +
            ryskLqPool.depositReceipts(address(this)).unredeemedShares;
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
            ryskLqPool.withdrawalEpochPricePerShare(
                ryskLqPool.withdrawalEpoch()
            );
    }

    /**
     * Checks if the strategy has enough shares to withdraw
     * considering both existing shares and shares included in the pending withdrawal.
     *
     * @param _sharesToWithdraw number of shares to withdraw
     */
    function _hasEnoughSharesToWithdraw(uint256 _sharesToWithdraw)
        internal
        view
        returns (bool)
    {
        return
            _sharesToWithdraw <= _getTotalShares() - pendingWithdrawal.shares;
    }
}
