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

import "hardhat/console.sol";

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

    /**
     * Emmited when the yield distribution cycle is updated.
     *
     * @param syncYieldStartTimestamp the timestamp of the start of the current
     * yield distribution cycle.
     * @param syncYieldAmount the amount being distributed in the current cycle.
     * @param depositedAmount the sum of deposits and distributed yield in the
     * contract.
     */
    event StrategySyncYield(
        uint256 syncYieldStartTimestamp,
        uint256 syncYieldAmount,
        uint256 depositedAmount
    );

    // rysk liquidity pool cannot be 0 address
    error RyskLiquidityPoolCannotBe0Address();
    // no withdrawal initiated
    error RyskNoWithdrawalInitiated();
    // cannot complete withdrawal in the same epoch
    error RyskCannotCompleteWithdrawalInSameEpoch();

    // The length of a yield distribution cycle
    uint256 private yieldCycleLength;
    // The sum of deposits and distributed yield
    uint256 private depositedAmount;
    // The amount being distributed in the yield distribution cycle
    uint256 private syncYieldAmount;
    // The timestamp of the start of the yield distribution cycle
    uint256 private syncYieldStartTimestamp;

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
        IERC20 _underlying,
        uint256 _yieldCycleLength
    ) BaseStrategy(_vault, _underlying, _admin) {
        if (_ryskLiquidityPool == address(0))
            revert RyskLiquidityPoolCannotBe0Address();
        if (_keeper == address(0)) revert StrategyKeeperCannotBe0Address();

        yieldCycleLength = _yieldCycleLength;

        ryskLqPool = IRyskLiquidityPool(_ryskLiquidityPool);

        underlying.safeIncreaseAllowance(_ryskLiquidityPool, type(uint256).max);
        underlyingDecimals = IERC20Metadata(address(_underlying)).decimals();

        _grantRole(KEEPER_ROLE, _keeper);
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

        _completePendingWithdrawal();
        syncYield();
    }

    /**
     * Updates the yield distribution cycle. This function can be called when
     * there's a new epoch in Rysk if the funds changed.
     *
     * @notice It can be called by anyone because there's not harm from it, and it
     * makes the system less reliant on the backend.
     */
    function syncYield() public {
        uint256 realDepositedAmount = _realInvestedAssets();

        if (depositedAmount + syncYieldAmount == realDepositedAmount) return;

        uint256 timestampDiff = block.timestamp - syncYieldStartTimestamp;

        // if there was yield being distributed
        if (syncYieldAmount > 0) {
            if (timestampDiff > yieldCycleLength) {
                // when the yield distribution is at 100%
                depositedAmount += syncYieldAmount;
            } else {
                // When there's an epoch before the yield distribution cycle ends,
                // adjust the deposit amount according to the distributed percentage.
                depositedAmount +=
                    (syncYieldAmount * (timestampDiff)) /
                    yieldCycleLength;
            }
        }

        // if funds were lost
        if (realDepositedAmount < depositedAmount) {
            depositedAmount = realDepositedAmount;
            syncYieldAmount = 0;
        } else {
            syncYieldAmount = realDepositedAmount - depositedAmount;
        }

        syncYieldStartTimestamp = block.timestamp;

        emit StrategySyncYield(
            syncYieldStartTimestamp,
            syncYieldAmount,
            depositedAmount
        );
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
    function investedAssets()
        public
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        uint256 realDepositedAmount = _realInvestedAssets();

        if ((syncYieldStartTimestamp == 0) || (syncYieldAmount == 0))
            return realDepositedAmount;

        uint256 cycleTotalDepositAmount = depositedAmount + syncYieldAmount;

        // if there less funds than expected at the end of the cycle,
        // return the real funds
        if (realDepositedAmount < cycleTotalDepositAmount)
            return realDepositedAmount;

        uint256 timestampDiff = block.timestamp - syncYieldStartTimestamp;

        // if the cycle ended
        if (timestampDiff > yieldCycleLength) return cycleTotalDepositAmount;

        return
            cycleTotalDepositAmount -
            (syncYieldAmount * (yieldCycleLength - timestampDiff)) /
            yieldCycleLength;
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        uint256 balance = underlying.balanceOf(address(this));

        if (balance == 0) revert StrategyNoUnderlying();

        emit StrategyInvested(balance);
        depositedAmount += balance;
        ryskLqPool.deposit(balance);
    }

    /// @inheritdoc IStrategy
    function withdrawToVault(uint256 _amount)
        external
        virtual
        override(IStrategy)
        onlyManager
        returns (uint256)
    {
        if (_amount == 0) revert StrategyAmountZero();

        uint256 withdrawalEpoch = ryskLqPool.withdrawalEpoch();
        _checkAndCompletePendingWithdrawal(withdrawalEpoch);

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
        syncYield();
        return 0;
    }

    //
    // Internal API
    //

    function _realInvestedAssets() public view virtual returns (uint256) {
        uint256 currentWithdrawalEpoch = ryskLqPool.withdrawalEpoch();
        // since withdrawal price per share is not updated until the end of the epoch,
        // we need to use the price per share from the previous epoch
        uint256 latestWithdrawalPricePerShare = ryskLqPool
            .withdrawalEpochPricePerShare(currentWithdrawalEpoch - 1);

        uint256 amountInDepositReceipt = _getAmountFromDepositReceipt();

        uint256 amountInPendingWithdrawal = _getAmountForPendingWithdrawal(
            currentWithdrawalEpoch,
            latestWithdrawalPricePerShare
        );

        uint256 amountInRedeemedShares = _sharesToUnderlying(
            _getSharesBalance(),
            latestWithdrawalPricePerShare
        );

        return
            amountInDepositReceipt +
            amountInPendingWithdrawal +
            amountInRedeemedShares;
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
     * Checks if there exists a pending withdrawal from an earlier epoch and completes it.
     * Rysk liquidity pool doesn't allow to initiate another withdrawal if a pending withdrawal from older epoch was not completed.
     *
     * @param _currentWithdrawalEpoch withdrawal epoch
     */
    function _checkAndCompletePendingWithdrawal(uint256 _currentWithdrawalEpoch)
        internal
    {
        IRyskLiquidityPool.WithdrawalReceipt
            memory withdrawalReceipt = _getWithdrawalReceipt();

        if (
            withdrawalReceipt.epoch != 0 &&
            withdrawalReceipt.epoch != _currentWithdrawalEpoch &&
            withdrawalReceipt.shares > 0
        ) {
            _completePendingWithdrawal();
        }
    }

    /**
     * Completes the pending withdrawal.
     */
    function _completePendingWithdrawal() internal {
        uint256 amountWithdrawn = ryskLqPool.completeWithdraw();

        if (amountWithdrawn > depositedAmount) depositedAmount = 0;
        else depositedAmount -= amountWithdrawn;

        emit StrategyWithdrawn(amountWithdrawn);
        underlying.safeTransfer(vault, amountWithdrawn);
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

    /**
     * Gets the amount of underlying from the deposit receipt which includes the pending deposit amount and unredeemed shares.
     * @notice the deposit receipt is updated only when user interacts with the Rysk liquidity pool contract (deposit, redeem, withdraw).
     *
     * @return amount of underlying form the deposit receipt
     */
    function _getAmountFromDepositReceipt() internal view returns (uint256) {
        IRyskLiquidityPool.DepositReceipt
            memory depositReceipt = _getDepositReceipt();
        uint256 depositEpoch = ryskLqPool.depositEpoch();

        if (
            depositReceipt.epoch == 0 ||
            (depositReceipt.amount == 0 && depositReceipt.unredeemedShares == 0)
        ) return 0;

        uint256 amountDepositedInCurrentEpoch = 0;
        uint256 pendingUnredeemedShares = 0;
        if (depositReceipt.epoch == depositEpoch) {
            // if epoch did not advance, shares for our deposit are not minted yet
            amountDepositedInCurrentEpoch = depositReceipt.amount;
        } else {
            // calulate the amount of shares that are minted but not yet added to the deposit receipt
            pendingUnredeemedShares = _underlyingToShares(
                depositReceipt.amount,
                ryskLqPool.depositEpochPricePerShare(depositReceipt.epoch)
            );
        }

        uint256 amountInUnredeemedShares = _sharesToUnderlying(
            depositReceipt.unredeemedShares + pendingUnredeemedShares,
            // use latest deposit epoch price per share
            ryskLqPool.depositEpochPricePerShare(depositEpoch - 1)
        );

        return amountDepositedInCurrentEpoch + amountInUnredeemedShares;
    }

    /**
     * Gets the amount of underlying for the pending withdrawal.
     *
     * @param _currentWithdrawalEpoch current withdrawal epoch
     * @param _latestWithdrawalPricePerShare latest withdrawal price per share
     *
     * @return amount of underlying for the pending withdrawal
     */
    function _getAmountForPendingWithdrawal(
        uint256 _currentWithdrawalEpoch,
        uint256 _latestWithdrawalPricePerShare
    ) internal view returns (uint256) {
        IRyskLiquidityPool.WithdrawalReceipt
            memory withdrawalReceipt = _getWithdrawalReceipt();

        if (withdrawalReceipt.epoch == 0) return 0;

        if (withdrawalReceipt.epoch == _currentWithdrawalEpoch)
            return
                _sharesToUnderlying(
                    withdrawalReceipt.shares,
                    _latestWithdrawalPricePerShare
                );

        return
            _sharesToUnderlying(
                withdrawalReceipt.shares,
                ryskLqPool.withdrawalEpochPricePerShare(withdrawalReceipt.epoch)
            );
    }
}
