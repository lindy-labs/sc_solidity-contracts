// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IStrategy} from "../strategy/IStrategy.sol";
import {CustomErrors} from "../interfaces/CustomErrors.sol";

contract MockStrategySync is IStrategy, AccessControl, CustomErrors {
    using SafeERC20 for IERC20;

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    address public immutable override(IStrategy) vault;

    IERC20 public immutable underlying;

    modifier onlyManager() {
        if (!hasRole(MANAGER_ROLE, msg.sender))
            revert StrategyCallerNotManager();
        _;
    }

    constructor(address _vault, IERC20 _underlying) {
        vault = _vault;
        underlying = _underlying;
    }

    function isSync() external pure virtual override(IStrategy) returns (bool) {
        return true;
    }

    function invest() external virtual override(IStrategy) {}

    function withdrawToVault(uint256 amount) external override(IStrategy) {
        underlying.transfer(vault, amount);
    }

    function investedAssets()
        external
        view
        override(IStrategy)
        returns (uint256)
    {
        return underlying.balanceOf(address(this));
    }

    function hasAssets() external view override(IStrategy) returns (bool) {
        return underlying.balanceOf(address(this)) > 0;
    }
}
