// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IStrategy} from "../strategy/IStrategy.sol";
import {IVault} from "../vault/IVault.sol";
import {IVaultSponsoring} from "../vault/IVaultSponsoring.sol";
import {MockStrategySync} from "./MockStrategySync.sol";
import {CustomErrors} from "../interfaces/CustomErrors.sol";
import {MockERC20} from "./MockERC20.sol";
import {PercentMath} from "../lib/PercentMath.sol";

/**
 * This strategy uses an extra currency, _yieldUnderlying_, with an exchange
 * rate of 1 to 1 to _underlying_. With this mechanism, we imitate strategies
 * that keep yield in a different currency, the Liquity's Yield DCA. The purpose
 * of this strategy is to write tests for the vault that use the `transferYield`
 * function.
 */
contract MockStrategyDirect is MockStrategySync {
    using PercentMath for uint256;
    using PercentMath for uint16;
    using SafeERC20 for IERC20;

    MockERC20 public yieldUnderlying;

    constructor(
        address _vault,
        IERC20 _underlying,
        address _admin,
        MockERC20 _yieldUnderlying
    ) MockStrategySync(_vault, _underlying, _admin) {
        yieldUnderlying = _yieldUnderlying;
    }

    /// @inheritdoc IStrategy
    function transferYield(address to, uint256 amount)
        external
        virtual
        override(MockStrategySync)
        returns (bool)
    {
        uint256 balance = yieldUnderlying.balanceOf(address(this));

        if (balance < amount) return false;

        return yieldUnderlying.transfer(to, amount);
    }
}
