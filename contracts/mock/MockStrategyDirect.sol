// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStrategy} from "../strategy/IStrategy.sol";
import {BaseStrategy} from "../strategy/BaseStrategy.sol";
import {MockERC20} from "./MockERC20.sol";
import {PercentMath} from "../lib/PercentMath.sol";

/**
 * This strategy uses an extra currency, _yieldUnderlying_, with an exchange
 * rate of 1 to 1 to _underlying_. With this mechanism, we imitate strategies
 * that keep yield in a different currency, the Liquity's Yield DCA. The purpose
 * of this strategy is to write tests for the vault that use the `transferYield`
 * function.
 */
contract MockStrategyDirect is BaseStrategy {
    using PercentMath for uint256;
    using PercentMath for uint16;
    using SafeERC20 for IERC20;

    MockERC20 public yieldUnderlying;

    constructor(
        address _vault,
        IERC20 _underlying,
        address _admin,
        MockERC20 _yieldUnderlying
    ) BaseStrategy(_vault, _underlying, _admin) {
        yieldUnderlying = _yieldUnderlying;
    }

    /// @inheritdoc IStrategy
    function isSync() external pure virtual override(IStrategy) returns (bool) {
        return true;
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) {}

    /// @inheritdoc IStrategy
    function withdrawToVault(uint256 amount) external override(IStrategy) {
        underlying.transfer(vault, amount);
    }

    /// @inheritdoc IStrategy
    function investedAssets()
        public
        view
        override(IStrategy)
        returns (uint256)
    {
        return
            underlying.balanceOf(address(this)) +
            yieldUnderlying.balanceOf(address(this));
    }

    /// @inheritdoc IStrategy
    function hasAssets() external view override(IStrategy) returns (bool) {
        return investedAssets() > 0;
    }

    /// @inheritdoc IStrategy
    function transferYield(address _to, uint256 _amount)
        external
        virtual
        override(IStrategy)
        returns (uint256)
    {
        uint256 balance = yieldUnderlying.balanceOf(address(this));

        uint256 amountToTransfer = _amount > balance ? balance : _amount;

        yieldUnderlying.transfer(_to, amountToTransfer);

        return amountToTransfer;
    }

    /// @inheritdoc BaseStrategy
    function transferAdminRights(address newAdmin)
        external
        override(BaseStrategy)
        onlyAdmin
    {}
}
