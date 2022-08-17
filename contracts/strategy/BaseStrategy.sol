// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {PercentMath} from "../lib/PercentMath.sol";
import {ERC165Query} from "../lib/ERC165Query.sol";
import {CustomErrors} from "../interfaces/CustomErrors.sol";
import {IStrategy} from "../strategy/IStrategy.sol";
import {IYearnVault} from "../interfaces/yearn/IYearnVault.sol";
import {IVault} from "../vault/IVault.sol";

/**
 * BaseStrategy provides common functionality for all strategies.
 */
abstract contract BaseStrategy is IStrategy, AccessControl, CustomErrors {
    using ERC165Query for address;

    /// role allowed to invest/withdraw from yearn vault
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    /// role allowed to change settings such as max loss on withdraw from yearn vault
    bytes32 public constant SETTINGS_ROLE = keccak256("SETTINGS_ROLE");
    // underlying ERC20 token
    IERC20 public underlying;
    // the vault linked to this strategy
    address public vault;

    //
    // Modifiers
    //

    modifier onlyManager() {
        if (!hasRole(MANAGER_ROLE, msg.sender))
            revert StrategyCallerNotManager();
        _;
    }

    modifier onlySettings() {
        if (!hasRole(SETTINGS_ROLE, msg.sender))
            revert StrategyCallerNotSettings();
        _;
    }

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender))
            revert StrategyCallerNotAdmin();
        _;
    }

    /**
     * Transfers administrator rights for the Strategy to another account,
     * revoking current admin roles and setting up the roles for the new admin.
     *
     * @notice Can only be called by the account with the ADMIN role.
     *
     * @param _newAdmin The new ADMIN account.
     */
    function transferAdminRights(address _newAdmin) external virtual onlyAdmin {
        _changeAdmin(_newAdmin);
    }

    /**
     * Sets up the essential fields required for any strategy implementation.
     *
     * @notice This is ment to be called only from the #constructor of the implemeting contracts.
     *
     * @param _vault address of the vault that will use this strategy
     * @param _underlying address of the underlying token
     * @param _admin address of the administrator account
     */
    function _setup(
        address _vault,
        address _underlying,
        address _admin
    ) internal {
        if (_admin == address(0)) revert StrategyAdminCannotBe0Address();
        if (_underlying == address(0))
            revert StrategyUnderlyingCannotBe0Address();
        if (!_vault.doesContractImplementInterface(type(IVault).interfaceId))
            revert StrategyNotIVault();

        vault = _vault;
        underlying = IERC20(_underlying);

        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        _setupRole(MANAGER_ROLE, _vault);
    }

    /**
     * Changes the account with the ADMIN role with the provided account address.
     *
     * @notice This is ment to be called only from the #transferAdminRights function of the implemeting contracts.
     *
     * @param _newAdmin The new admin account for the strategy.
     */
    function _changeAdmin(address _newAdmin) internal {
        if (_newAdmin == address(0)) revert StrategyAdminCannotBe0Address();
        if (_newAdmin == msg.sender)
            revert StrategyCannotTransferAdminRightsToSelf();

        _setupRole(DEFAULT_ADMIN_ROLE, _newAdmin);

        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
}
