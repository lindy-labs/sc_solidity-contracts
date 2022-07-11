// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {PercentMath} from "../../lib/PercentMath.sol";
import {ERC165Query} from "../../lib/ERC165Query.sol";
import {IStrategy} from "../IStrategy.sol";
import {CustomErrors} from "../../interfaces/CustomErrors.sol";
import {IRyskLiquidityPool} from "../../interfaces/rysk/IRyskLiquidityPool.sol";
import {IVault} from "../../vault/IVault.sol";

/**
 * RyskStrategy generates yield by investing into a Rysk LiquidityPool,
 * that serves to provide liquidity for a dynamic hedging options AMM.
 *
 * @notice This strategy is asyncrhonous (doesn't support immediate withdrawals).
 */
contract RyskStrategy is IStrategy, AccessControl, Ownable, CustomErrors {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;
    using ERC165Query for address;

    /// role allowed to deposit/withdraw from the Rysk liquidity pool
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    // underlying ERC20 token
    IERC20 public immutable underlying;
    /// @inheritdoc IStrategy
    address public immutable override(IStrategy) vault;
    // rysk liquidity pool that this strategy is interacting with
    IRyskLiquidityPool public immutable ryskLqPool;
    // pending withdrawal receipt
    IRyskLiquidityPool.WithdrawalReceipt pendingWithdrawal;

    /**
     * Emmited when a withdrawal has been initiated.
     *
     *@param shares to be withdrawn
     */
    event RyskWithdrawalInitiated(uint256 shares);

    // rysk liquidity pool is 0x
    error RyskLiquidityPoolCannotBe0Address();
    // no withdrawal initiated
    error RyskNoWithdrawalInitiated();
    // cannot complete withdrawal in the same epoch
    error RyskCannotComipleteWithdrawalInSameEpoch();

    /**
     * @param _vault address of the vault that will use this strategy
     * @param _owner address of the owner of this strategy
     * @param _ryskLiquidityPool address of the rysk liquidity pool that this strategy is using
     * @param _underlying address of the underlying token
     */
    constructor(
        address _vault,
        address _owner,
        address _ryskLiquidityPool,
        address _underlying
    ) {
        if (_owner == address(0)) revert StrategyOwnerCannotBe0Address();
        if (_ryskLiquidityPool == address(0))
            revert RyskLiquidityPoolCannotBe0Address();
        if (_underlying == address(0))
            revert StrategyUnderlyingCannotBe0Address();
        if (!_vault.doesContractImplementInterface(type(IVault).interfaceId))
            revert StrategyNotIVault();

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MANAGER_ROLE, _vault);

        vault = _vault;
        ryskLqPool = IRyskLiquidityPool(_ryskLiquidityPool);
        underlying = IERC20(_underlying);

        underlying.approve(_ryskLiquidityPool, type(uint256).max);
    }

    //
    // Modifiers
    //

    modifier onlyManager() {
        if (!hasRole(MANAGER_ROLE, msg.sender))
            revert StrategyCallerNotManager();
        _;
    }

    //
    // Ownable
    //

    /**
     * Transfers ownership of the Strategy to another account,
     * revoking previous owner's ADMIN role and setting up ADMIN role for the new owner.
     *
     * @notice Can only be called by the current owner.
     *
     * @param _newOwner The new owner of the contract.
     */
    function transferOwnership(address _newOwner)
        public
        override(Ownable)
        onlyOwner
    {
        if (_newOwner == address(0x0)) revert StrategyOwnerCannotBe0Address();
        if (_newOwner == msg.sender)
            revert StrategyCannotTransferOwnershipToSelf();

        _transferOwnership(_newOwner);

        _setupRole(DEFAULT_ADMIN_ROLE, _newOwner);

        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
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
        return _sharesToUnderlying(_getTotalShares());
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

        uint256 shares = _underlyingToShares(_amount);

        _resetPendingWithdrawalIfEpochAdvanced();

        // because the vault can call updateInvested => withdrawToVault multiple times during the same epoch,
        // and rysk liquidity pool aggregates withdrawal amounts inititated during the same epoch,
        // we cannot withdraw less than already pending amount
        if (pendingWithdrawal.shares >= shares) return;

        uint256 sharesToWithdraw = shares - pendingWithdrawal.shares;
        if (!_hasEnoughShares(sharesToWithdraw))
            revert StrategyNotEnoughShares();

        pendingWithdrawal.shares += uint128(sharesToWithdraw);

        emit RyskWithdrawalInitiated(sharesToWithdraw);
        ryskLqPool.initiateWithdraw(sharesToWithdraw);
    }

    /**
     * Completes the withdrawal initiated by withdrawToVault.
     *
     * @notice Expected to be called by the backend once the Rysk liquidity pool enters a new epoch.
     * Backend should subscribe to 'EpochExecuted' event on Rysk LiquidityPool contract,
     * and act by calling this function when the event is emitted to complete ongoing withdrawal.
     */
    function completeWithdrawal() external {
        if (pendingWithdrawal.epoch == 0) revert RyskNoWithdrawalInitiated();
        if (pendingWithdrawal.epoch == ryskLqPool.epoch())
            revert RyskCannotComipleteWithdrawalInSameEpoch();

        uint256 sharesToWithdraw = ryskLqPool
            .withdrawalReceipts(address(this))
            .shares;

        uint256 amountWithdrawn = ryskLqPool.completeWithdraw(sharesToWithdraw);

        emit StrategyWithdrawn(amountWithdrawn);
        underlying.safeTransfer(vault, amountWithdrawn);
    }

    /**
     * Get the number of Rysk liquidity pool shares owned by the strategy.
     *
     * @return shares owned by the strategy
     */
    function _getTotalShares() internal view returns (uint256) {
        // total shares = redeemed shares + unredeemed shares
        return
            ryskLqPool.balanceOf(address(this)) +
            ryskLqPool.depositReceipts(address(this)).unredeemedShares;
    }

    /**
     * Calculates the value of Rysk liquidity pool vault shares in underlying.
     *
     * @param _shares number of shares
     *
     * @return underlying value of shares
     */
    function _sharesToUnderlying(uint256 _shares)
        internal
        view
        returns (uint256)
    {
        return
            (_shares * ryskLqPool.epochPricePerShare(ryskLqPool.epoch())) /
            1e18;
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
            (_underlying * 1e18) /
            ryskLqPool.epochPricePerShare(ryskLqPool.epoch());
    }

    /**
     * Checks if the strategy has enough shares to withdraw.
     *
     * @param _sharesToWithdraw number of shares to withdraw
     */
    function _hasEnoughShares(uint256 _sharesToWithdraw)
        internal
        view
        returns (bool)
    {
        return
            _sharesToWithdraw <= _getTotalShares() - pendingWithdrawal.shares;
    }

    /**
     * Resets the pending withdrawal if the epoch when withdrawal receipt was created
     * is older than the current epoch.
     */
    function _resetPendingWithdrawalIfEpochAdvanced() internal {
        uint256 currentEpoch = ryskLqPool.epoch();

        // we need to check epoch here because if epoch has advanced,
        // previous withdrawal receipt will be overridden
        if (pendingWithdrawal.epoch != currentEpoch) {
            // reset pending withdrawal amount since the receipt will be overridden
            pendingWithdrawal.shares = 0;
            pendingWithdrawal.epoch = uint128(currentEpoch);
        }
    }
}
