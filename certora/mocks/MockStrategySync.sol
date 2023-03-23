// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IStrategy} from "../../contracts/strategy/IStrategy.sol";
import {BaseStrategy} from "../../contracts/strategy/BaseStrategy.sol";
import {CustomErrors} from "../../contracts/interfaces/CustomErrors.sol";
import {PercentMath} from "../../contracts/lib/PercentMath.sol";

contract MockStrategySync is BaseStrategy {
    using PercentMath for uint256;

    constructor(
        address _vault,
        IERC20 _underlying,
        address _admin
    ) BaseStrategy(_vault, _underlying, _admin) {}

    /// @inheritdoc IStrategy
    function isSync() external pure virtual override(IStrategy) returns (bool) {
        return true;
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) {}

    /// @inheritdoc IStrategy
    function withdrawToVault(uint256 amount)
        external
        override(IStrategy)
        returns (uint256)
    {
        underlying.transfer(vault, amount);

        return amount;
    }

    /// @inheritdoc IStrategy
    function investedAssets()
        external
        view
        override(IStrategy)
        returns (uint256)
    {
        return underlying.balanceOf(address(this));
    }

    /// @inheritdoc IStrategy
    function hasAssets() external view override(IStrategy) returns (bool) {
        return underlying.balanceOf(address(this)) > 0;
    }

    function transferAdminRights(address newAdmin)
        external
        override(BaseStrategy)
        onlyAdmin
    {}
}
