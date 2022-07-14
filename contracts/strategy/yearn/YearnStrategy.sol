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
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";
import {IVault} from "../../vault/IVault.sol";

/**
 * YearnStrategy generates yield by investing into a Yearn vault.
 *
 * @notice This strategy is syncrhonous (supports immediate withdrawals).
 */
contract YearnStrategy is IStrategy, AccessControl, Ownable, CustomErrors {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;
    using ERC165Query for address;

    // yearn vault is 0x
    error StrategyYearnVaultCannotBe0Address();

    /// role allowed to invest/withdraw from yearn vault
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    // underlying ERC20 token
    IERC20 public immutable underlying;
    /// @inheritdoc IStrategy
    address public immutable override(IStrategy) vault;
    // yearn vault that this strategy is interacting with
    IYearnVault public immutable yVault;

    /**
     * @param _vault address of the vault that will use this strategy
     * @param _owner address of the owner of this strategy
     * @param _yVault address of the yearn vault that this strategy is using
     * @param _underlying address of the underlying token
     */
    constructor(
        address _vault,
        address _owner,
        address _yVault,
        address _underlying
    ) {
        if (_owner == address(0)) revert StrategyOwnerCannotBe0Address();
        if (_yVault == address(0)) revert StrategyYearnVaultCannotBe0Address();
        if (_underlying == address(0))
            revert StrategyUnderlyingCannotBe0Address();

        if (!_vault.doesContractImplementInterface(type(IVault).interfaceId))
            revert StrategyNotIVault();

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MANAGER_ROLE, _vault);

        vault = _vault;
        yVault = IYearnVault(_yVault);
        underlying = IERC20(_underlying);

        underlying.approve(_yVault, type(uint256).max);
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

    /**
     * Yearn strategy is synchronous meaning it supports immediate withdrawals.
     *
     * @return true always
     */
    function isSync() external pure override(IStrategy) returns (bool) {
        return true;
    }

    /// @inheritdoc IStrategy
    function hasAssets()
        external
        view
        virtual
        override(IStrategy)
        returns (bool)
    {
        return _getShares() != 0;
    }

    /// @inheritdoc IStrategy
    function investedAssets()
        external
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        return _sharesToUnderlying(_getShares()) + _getUnderlyingBalance();
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        uint256 beforeBalance = _getUnderlyingBalance();
        if (beforeBalance == 0) revert StrategyNoUnderlying();

        yVault.deposit(type(uint256).max, address(this));

        uint256 afterBalance = _getUnderlyingBalance();

        emit StrategyInvested(beforeBalance - afterBalance);
    }

    /// @inheritdoc IStrategy
    function withdrawToVault(uint256 amount)
        external
        virtual
        override(IStrategy)
        onlyManager
    {
        if (amount == 0) revert StrategyAmountZero();
        uint256 uninvestedUnderlying = _getUnderlyingBalance();

        if (amount > uninvestedUnderlying) {
            uint256 _sharesToWithdraw = _underlyingToShares(
                amount - uninvestedUnderlying
            );

            if (_sharesToWithdraw > _getShares())
                revert StrategyNotEnoughShares();

            // burn shares and withdraw required underlying to strategy
            yVault.withdraw(_sharesToWithdraw, address(this), 1);
        }

        // transfer underlying to vault
        underlying.safeTransfer(vault, amount);

        emit StrategyWithdrawn(amount);
    }

    /**
     * Get the underlying balance of the strategy.
     *
     * @return underlying balance of the strategy
     */
    function _getUnderlyingBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    /**
     * Get the number of yearn vault shares owned by the strategy.
     *
     * @return shares owned by the strategy
     */
    function _getShares() internal view returns (uint256) {
        return yVault.balanceOf(address(this));
    }

    /**
     * Calculates the value of yearn vault shares in underlying.
     *
     * @param _shares number of yearn vault shares
     *
     * @return underlying value of yearn vault shares
     */
    function _sharesToUnderlying(uint256 _shares)
        internal
        view
        returns (uint256)
    {
        return (_shares * yVault.pricePerShare()) / 1e18;
    }

    /**
     * Calculates the amount of underlying in number of yearn vault shares.
     *
     * @param _underlying amount of underlying
     *
     * @return number of yearn vault shares
     */
    function _underlyingToShares(uint256 _underlying)
        internal
        view
        returns (uint256)
    {
        return (_underlying * 1e18) / yVault.pricePerShare();
    }
}
