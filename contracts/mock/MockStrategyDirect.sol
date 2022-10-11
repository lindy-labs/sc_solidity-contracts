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

contract MockStrategyDirect is BaseStrategy {
    using PercentMath for uint256;
    using PercentMath for uint16;

    MockERC20 public yieldUnderlying;
    uint16 principalPct;
    uint256 underlyingDebt;

    constructor(
        address _vault,
        IERC20 _underlying,
        address _admin,
        MockERC20 _yieldUnderlying,
        uint16 _principalPct
    ) BaseStrategy(_vault, _underlying, _admin) {
        yieldUnderlying = _yieldUnderlying;
        principalPct = _principalPct;
        underlyingDebt = 0;
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

    function invest() external virtual override(IStrategy) {
        uint256 toProtect = (IVault(vault).totalPrincipal() + IVaultSponsoring(vault).totalSponsored()).pctOf(principalPct);
        uint256 underlyingBalance = balanceUnderlying();
        uint256 yieldUnderlyingBalance = yieldUnderlying.balanceOf(address(this));
        
        if (underlyingBalance < toProtect && yieldUnderlyingBalance > 0) {
            uint256 diff = toProtect - underlyingBalance;
            if (diff < yieldUnderlyingBalance) {
                yieldToUnderlying(diff);
            } else {
                yieldToUnderlying(yieldUnderlyingBalance);
            }
        } else {
            if (underlyingBalance > toProtect) {
                uint256 diff = underlyingBalance - toProtect;
                underlyingToYield(diff);
            }
        }
    }

    function setPrincipalPct(uint16 pct) external {
        principalPct = pct;
    }

    function underlyingToYield(uint256 amount) internal {
        yieldUnderlying.mint(address(this), amount);
        underlyingDebt += amount;
    }

    function yieldToUnderlying(uint256 amount) internal {
        yieldUnderlying.burn(address(this), amount);
        underlyingDebt -= amount;
    }

    function balanceUnderlying() internal view returns (uint256) {
        return underlying.balanceOf(address(this)) - underlyingDebt;       
    } 


    function sendYield(uint256 amount, address to)
        external
        virtual
        override(BaseStrategy)
    {
        yieldUnderlying.transfer(to, amount);
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
