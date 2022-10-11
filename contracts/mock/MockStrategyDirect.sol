// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IStrategy} from "../strategy/IStrategy.sol";
import {BaseStrategy} from "../strategy/BaseStrategy.sol";
import {CustomErrors} from "../interfaces/CustomErrors.sol";
import {MockERC20} from "./MockERC20.sol";

contract MockStrategyDirect is BaseStrategy {
    MockERC20 public yieldUnderlying;

    constructor(
        address _vault,
        IERC20 _underlying,
        address _admin,
        MockERC20 _yieldUnderlying
    ) BaseStrategy(_vault, _underlying, _admin) {
        yieldUnderlying = _yieldUnderlying;
    }

    function isSync() external pure virtual override(IStrategy) returns (bool) {
        return false;
    }

    function isDirect()
        external
        pure
        virtual
        override(BaseStrategy)
        returns (bool)
    {
        return true;
    }

    function invest() external virtual override(IStrategy) {}

    function sendYield(uint256 amount, address to)
        external
        virtual
        override(BaseStrategy)
    {
        underlying.transfer(0x1000000000000000000000000000000000000000, amount);
        yieldUnderlying.mint(to, amount);
    }

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

    function transferAdminRights(address newAdmin)
        external
        override(BaseStrategy)
        onlyAdmin
    {}
}
