// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IStrategy} from "../strategy/IStrategy.sol";
import {IVault} from "../vault/IVault.sol";
import {IVaultSponsoring} from "../vault/IVaultSponsoring.sol";
import {BaseStrategy} from "../strategy/BaseStrategy.sol";
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
contract MockStrategyDirect is BaseStrategy {
    using PercentMath for uint256;
    using PercentMath for uint16;
    using SafeERC20 for IERC20;

    MockERC20 public yieldUnderlying;

    uint16 principalPct;

    uint256 underlyingDebt;

    constructor(
        address _vault,
        IERC20 _underlying,
        address _admin,
        MockERC20 _yieldUnderlying,
        uint16 _principalProtectionPct
    ) BaseStrategy(_vault, _underlying, _admin) {
        yieldUnderlying = _yieldUnderlying;
        principalPct = _principalProtectionPct;
        underlyingDebt = 0;
    }

    /// @inheritdoc IStrategy
    function isSync() external pure virtual override(IStrategy) returns (bool) {
        return true;
    }

    /**
     * This function will rebalance the total amount taking into account the
     * protected principal. The protected principal is set kept in `underlying`
     * and the remaining is converted to/from `yieldUnderlying.`
     */
    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) {
        uint256 toProtect = (IVault(vault).totalPrincipal() +
            IVaultSponsoring(vault).totalSponsored()).pctOf(principalPct);
        uint256 balance = underlyingBalance();
        uint256 yieldBalance = yieldUnderlying.balanceOf(address(this));

        if (balance < toProtect && yieldBalance > 0) {
            uint256 diff = toProtect - balance;

            if (diff < yieldBalance) {
                yieldToUnderlying(diff);
            } else {
                yieldToUnderlying(yieldBalance);
            }
        } else if (balance > toProtect) {
            uint256 diff = balance - toProtect;
            underlyingToYield(diff);
        }
    }

    function setPrincipalProtectionPct(uint16 _pct) external {
        principalPct = _pct;
    }

    /// @inheritdoc IStrategy
    function transferYield(address to, uint256 amount)
        external
        virtual
        override(IStrategy)
        returns (bool)
    {
        uint256 balance = yieldUnderlying.balanceOf(address(this));

        if (balance < amount) return false;

        return yieldUnderlying.transfer(to, amount);
    }

    /// @inheritdoc IStrategy
    function withdrawToVault(uint256 amount) external override(IStrategy) {
        uint256 balance = underlying.balanceOf(address(this));

        if (balance > amount) underlying.safeTransfer(vault, amount);
        else underlying.safeTransfer(vault, balance);
    }

    /// @inheritdoc IStrategy
    function investedAssets()
        external
        view
        override(IStrategy)
        returns (uint256)
    {
        return
            underlying.balanceOf(address(this)) -
            underlyingDebt +
            yieldUnderlying.balanceOf(address(this));
    }

    /// @inheritdoc IStrategy
    function hasAssets() external view override(IStrategy) returns (bool) {
        return
            underlying.balanceOf(address(this)) > 0 ||
            yieldUnderlying.balanceOf(address(this)) > 0;
    }

    function transferAdminRights(address newAdmin)
        external
        override(BaseStrategy)
        onlyAdmin
    {}

    function underlyingToYield(uint256 amount) internal {
        yieldUnderlying.mint(address(this), amount);
        underlyingDebt += amount;
    }

    function yieldToUnderlying(uint256 amount) internal {
        yieldUnderlying.burn(address(this), amount);
        underlyingDebt -= amount;
    }

    function underlyingBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this)) - underlyingDebt;
    }
}
