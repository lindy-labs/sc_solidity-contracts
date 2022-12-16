# Properties of RyskStrategy

## Overview of the RyskStrategy

RyskStrategy generates yield by investing into a Rysk LiquidityPool, that serves to provide liquidity for a dynamic hedging options AMM.

The RyskStrategy has the following state variables, which are all quite static global settings and set in the initializer function:
*    `vault`(type `address`), address of the vault that will use this strategy.
*    `underlying` (type `IERC20`), underlying ERC20 asset address. It should be consistent with the strategy's underlying asset. It's specified in the constructor.
*    `admin` (type `address`), address of the administrator account for this strategy.
*    `keeper` (type `address`), related to the role (modifier).
*    `ryskLqPool` (type `IRyskLiquidityPool`), rysk liquidity pool that this strategy is interacting with.
*    `underlyingDecimals` (type `uint256`), number of decimal places of underlying ERC20

It has the following external/public functions that are privileged and move underlying assets or trade assets:
*     function invest() external virtual override(IStrategy) onlyManager
*     function withdrawToVault(uint256 _amount) external virtual override(IStrategy) onlyManager

It has a function updating admin rights:
*     function transferAdminRights(address _newAdmin) external virtual onlyAdmin

It has the following external/public functions that are view only and change nothing:
*     function isSync() external pure override(IStrategy) returns (bool)
*     function hasAssets() external view virtual override(IStrategy) returns (bool)
*     function investedAssets() public view virtual override(IStrategy) returns (uint256)

## Properties

| No. | Property  | Category | Priority | Specified | Verified | Report |
| ---- | --------  | -------- | -------- | -------- | -------- | -------- |
|   1   | privileged functions should revert if the `msg.sender` does not have the privilege | High level  | high | Y | Y | [Link](https://prover.certora.com/output/52311/95d16e6de876afc15ae3?anonymousKey=c67787f0e09f2d7558944e26cfd0499ea0948ffd) |
|   2   | `invest()` should revert if `underlying.balanceOf(address(this)) == 0` | Unit test  | medium | Y | Y | [Link](https://prover.certora.com/output/52311/12c428c31cfa583a412e?anonymousKey=65e17c4d25f3a31ff96e646ae507bf1a79153fde) |
|   3   | `invest()` should perform a deposit in the Rysk Liquidity Pool | medium  | medium | Y | Y | [Link](https://prover.certora.com/output/52311/d363fce80b1d17647eaa?anonymousKey=d767938b5d4fa30e7369b5101cdee6bf87509fa6) |
|   4   | `withdrawToVault(uint256 _amount)` should revert if `_amount` is zero | Unit test  | medium | Y | Y | [Link](https://prover.certora.com/output/52311/df662363dd3c093b5d0b?anonymousKey=d20958a42db7ed06745492cc562a763236abdc26) |
|   5   | `withdrawToVault(uint256 _amount)` should initiate a withdraw to the Rysk Liquidity Pool of the amount of shares needed | Variable transition  | medium | Y | Y | [Link](https://prover.certora.com/output/52311/7704625c76cbd1edbd0a?anonymousKey=08986a407e74fec25cc2462747f6ba47e12b8b34) |
|   6   | `completeWithdrawal()` should complete the pending withdrawal initiated in an earlier epoch | Variable transition  | medium | Y | Y | [Link] (https://prover.certora.com/output/52311/9a9f973d745dfb437235?anonymousKey=7b89d19576f225afb00999621285b4d90bf62541) |
|   7   | `isSync()` should return `false` | Unit test  | medium | Y | Y | [Link](https://prover.certora.com/output/52311/b1aabff3f4ee53f8a731?anonymousKey=32d441fb5d750f666f42d76c3e6fea9b44eedc1c) |
|   8   | `hasAssets()` return value should be consistent with `investedAssets()` return value | Unit test  | medium | Y | Y | [Link](https://prover.certora.com/output/52311/45d57faa4b1ea754c6e2?anonymousKey=59c9e270342fcefc62b41f4a9c317664167db6d4) |
|   9   | `transferAdminRights(adddress)` should transfer admin roles from msg sender to the new admin | Variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/eee13271020c70de3a36?anonymousKey=d351d915e1461142e3212d2eb9e2aa6c0c62491a) |
