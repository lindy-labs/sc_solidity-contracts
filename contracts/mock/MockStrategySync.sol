// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IStrategy} from "../strategy/IStrategy.sol";
import {BaseStrategy} from "../strategy/BaseStrategy.sol";
import {CustomErrors} from "../interfaces/CustomErrors.sol";

contract MockStrategySync is BaseStrategy {
    constructor(
        address _vault,
        IERC20 _underlying,
        address _admin
    ) BaseStrategy(_vault, _underlying, _admin) {}

    function isSync() external pure virtual override(IStrategy) returns (bool) {
        return true;
    }

    function transferYield(address, uint256)
        external
        virtual
        override(IStrategy)
        returns (bool)
    {
        return false;
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

    function transferAdminRights(address newAdmin)
        external
        override(BaseStrategy)
        onlyAdmin
    {}
}
