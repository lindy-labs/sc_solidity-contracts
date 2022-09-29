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

        IRyskLiquidityPool.DepositReceipt memory depositReceipt = ryskLqPool
            .depositReceipts(address(this));

        return
            depositReceipt.amount != 0 || depositReceipt.unredeemedShares != 0;
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
        IRyskLiquidityPool.DepositReceipt memory depositReceipt = ryskLqPool
            .depositReceipts(address(this));
        uint256 currentPricePerShare = _getWithdrawalPricePerShare();

        // shares for pending deposit (not yet minted or not yet updated on the deposit receipt as unredeemed)
        uint256 amountInPendingDepositShares = _getAmountInSharesForPendingDeposit(
                depositReceipt.epoch,
                depositReceipt.amount,
                currentPricePerShare
            );

        // shares marked for withdrawal that are now owned by the pool itself
        uint256 amountInPendingWithdrawalShares = _sharesToUnderlying(
            pendingWithdrawal.shares,
            ryskLqPool.withdrawalEpochPricePerShare(pendingWithdrawal.epoch)
        );

        // unredeemed shares are not counted in the strategy's balance
        // because they are not yet claimed (they are still owned by the pool)
        uint256 amountInUnredeemedShares = _sharesToUnderlying(
            depositReceipt.unredeemedShares,
            currentPricePerShare
        );

        // redeemed shares that are owned by the strategy
        uint256 amountInRedeemedShares = _sharesToUnderlying(
            ryskLqPool.balanceOf(address(this)),
            currentPricePerShare
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
        if (_amount > investedAssets()) revert StrategyNotEnoughShares();

        uint256 currentWithdrawalEpoch = ryskLqPool.withdrawalEpoch();

        // cannot initiate another withdrawal if a pending withdrawal from older epoch is not completed
        if (
            pendingWithdrawal.epoch != 0 &&
            pendingWithdrawal.epoch != currentWithdrawalEpoch
        ) revert RyskPendingWithdrawalNotCompleted();

        uint256 currentPricePerShare = ryskLqPool.withdrawalEpochPricePerShare(
            currentWithdrawalEpoch
        );

        uint256 sharesToWithdraw = _underlyingToShares(
            _amount,
            currentPricePerShare
        );

        _updateCachedPendingWithdrawalReceipt(
            currentWithdrawalEpoch,
            sharesToWithdraw
        );

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
     * Used in the investedAssets() to get the amount of underlying as shares we would receive for making a deposit since shares are not minted immediately.
     * Shares are minted in the next deposit epoch, but are owned by the pool and deposit receipt property 'unredeemedShares' is not updated at that point.
     * For the deposit receipt to be updated with the actual count of unredeemed shares from the past epochs,
     * the strategy has to interact with the Rysk liquidity pool by either depositing, withdrawing or redeeming.
     * This is why we rely on the deposit receipt epoch and price per share properties to calculate the amount of shares we would receive for that deposit.
     *
     * @param _depositEpoch deposit epoch
     * @param _depositAmount amount of underlying tokens in the deposit receipt
     * @param _pricePerShare price per share for the current withdrawal epoch
     *
     * @return amount of underlying expressed as pending shares * @param _pricePerShare
     */
    function _getAmountInSharesForPendingDeposit(
        uint256 _depositEpoch,
        uint256 _depositAmount,
        uint256 _pricePerShare
    ) internal view returns (uint256) {
        if (_depositEpoch == 0 || _depositAmount == 0) return 0;

        uint256 depositPricePerShare = ryskLqPool.depositEpochPricePerShare(
            _depositEpoch
        );

        uint256 pendingDepositShares = _underlyingToShares(
            _depositAmount,
            depositPricePerShare
        );

        return _sharesToUnderlying(pendingDepositShares, _pricePerShare);
    }

    /**
     * Get the price per share for the current withdrawal epoch.
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
     * Calculates the amount of shares for provided amount of underlying and price per share.
     *
     * @param _underlying amount of underlying
     * @param _pricePerShare price per share
     *
     * @return number of shares
     */
    function _underlyingToShares(uint256 _underlying, uint256 _pricePerShare)
        internal
        pure
        returns (uint256)
    {
        return (_underlying * SHARES_CONVERSION_FACTOR) / _pricePerShare;
    }

    /**
     * Calculates the amount of underlying for provided number of Rysk liquidity pool shares and price per share.
     *
     * @param _shares number of shares
     * @param _pricePerShare price per share
     *
     * @return amount of underlying
     */
    function _sharesToUnderlying(uint256 _shares, uint256 _pricePerShare)
        internal
        pure
        returns (uint256)
    {
        return (_shares * _pricePerShare) / SHARES_CONVERSION_FACTOR;
    }

    /**
     * Updates the cached pending withdrawal receipt field.
     *
     * @param _epoch current withdrawal epoch
     * @param _shares number of shares to withdraw
     */
    function _updateCachedPendingWithdrawalReceipt(
        uint256 _epoch,
        uint256 _shares
    ) internal {
        if (pendingWithdrawal.epoch == 0) {
            // there is no pending withdrawal so we can initialize a new one
            pendingWithdrawal.epoch = uint128(_epoch);
        }

        pendingWithdrawal.shares += uint128(_shares);
    }
}
