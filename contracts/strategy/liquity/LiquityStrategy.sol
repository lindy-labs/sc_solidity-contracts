// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {PercentMath} from "../../lib/PercentMath.sol";
import {ERC165Query} from "../../lib/ERC165Query.sol";
import {IStrategy} from "../IStrategy.sol";
import {CustomErrors} from "../../interfaces/CustomErrors.sol";
import {IVault} from "../../vault/IVault.sol";
import {IStablilityPool} from "../../interfaces/liquity/IStabilityPool.sol";

/***
 * Gives out LQTY & ETH as rewards
 */
contract LiquityStrategy is IStrategy, AccessControl, CustomErrors {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;
    using ERC165Query for address;

    error LiquityStabilityPoolCannotBeAddressZero();

    bytes32 public constant MANAGER_ROLE =
        0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08; // keccak256("MANAGER_ROLE");

    IERC20 public immutable underlying; // lusd
    /// @inheritdoc IStrategy
    address public immutable override(IStrategy) vault;
    IStabilityPool public immutable stabilityPool;
    address public immutable lqty; // reward token

    constructor(
        address _vault,
        address _owner,
        address _stabilityPool,
        address _lqty,
        address _underlying
    ) {
        if (_owner == address(0)) revert StrategyOwnerCannotBe0Address();
        if (_lqty == address(0)) revert StrategyYieldTokenCannotBe0Address();
        if (_stabilityPool == address(0))
            revert StrategyYieldTokenCannotBe0Address();
        if (_underlying == address(0))
            revert StrategyUnderlyingCannotBe0Address();

        if (!_vault.doesContractImplementInterface(type(IVault).interfaceId))
            revert StrategyNotIVault();

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MANAGER_ROLE, _vault);
        vault = _vault;
        underlying = IERC20(_underlying);
        lqty = _lqty;
    }
}
