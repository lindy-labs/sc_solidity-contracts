// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IStrategy} from "../strategy/IStrategy.sol";
import {BaseStrategy} from "../strategy/BaseStrategy.sol";
import {CustomErrors} from "../interfaces/CustomErrors.sol";
import {PercentMath} from "../lib/PercentMath.sol";

contract MockStrategySync is BaseStrategy {
    using PercentMath for uint256;

    uint16 amountToWithdrawReductionPct;

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
        uint256 toWithdraw = amount.pctOf(10000 - amountToWithdrawReductionPct);
        underlying.transfer(vault, toWithdraw);

        return toWithdraw;
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

    function setAmountToWithdrawReductionPct(uint16 _reductionPct) external {
        amountToWithdrawReductionPct = _reductionPct;
    }
}
