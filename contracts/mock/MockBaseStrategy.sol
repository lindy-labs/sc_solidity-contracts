// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IStrategy} from "../strategy/IStrategy.sol";
import {BaseStrategy} from "../strategy/BaseStrategy.sol";

contract MockBaseStrategy is BaseStrategy {
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
    function withdrawToVault(uint256 amount) external override(IStrategy) {}

    /// @inheritdoc IStrategy
    function investedAssets()
        external
        pure
        override(IStrategy)
        returns (uint256)
    {
        return 0;
    }

    /// @inheritdoc IStrategy
    function hasAssets() external pure override(IStrategy) returns (bool) {
        return false;
    }
}
