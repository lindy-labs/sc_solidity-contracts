# Properties of LiquityStrategy

## Overview of the LiquityStrategy

The LiquityStrategy contract generates yield by investing LUSD assets into Liquity Stability Pool contract. Stability pool gives out LQTY & ETH as rewards for liquidity providers. The LQTY rewards are normal yield rewards. ETH rewards are given when liquidating Troves using the LUSD we deposited. When liquidation happens, our balance of LUSD goes down and we get an 1.1x (or higher) value of ETH. In short, we make a 10% profit in ETH every time our LUSD is used for liquidation by the stability pool.

The LiquidityStrategy has the following state variables, which are all quite static global settings and set in the initializer function
* `underlying` (type `IERC20`), the underlying ERC20 asset of the strategy, or LUSD in this case
* `vault` (type `address`), the vault contract address which the strategy is linked to
* `stabilityPool` (type `IStabilityPool`), the Liquity Stability Pool;
* `curveExchange` (type `ICurveExchange`), the Curve Exchange contract to get exchange rate of LUSD/LQTY and LUSD/WETH
* `lqty` (type `IERC20`), the LQTY token
* `allowedSwapTargets` (type `mapping(address => bool)`), whitelist of swap targets
* `minPrincipalProtectionPct` (type `uint16`), a percentage that specifies the minimum amount of principal to protect. This value acts as a threshold and is applied only when the total underlying assets are grater tha the minimum amount of principal to protect. The protected principal is kept in LUSD. For instance, if the minimum protected principal is 150%, the total principal is 100 LUSD, and the total yield (ETH+LQTY) is worth 100 LUSD. When the backend rebalances the strategy, it has to ensure that at least 50 LUSD is converted from ETH+LQTY to maintain a 150% minimum protected principal.

It has the following initializer:
* `function initialize(address _vault, address _admin, address _stabilityPool, address _lqty, address _underlying, address _keeper, uint16 _principalProtectionPct, address _curveExchange)` 

It has the following external/public functions that are privileged and change settings:
* `function setMinPrincipalProtectionPct(uint16 _pct) external onlySettings`
* `function transferAdminRights(address _newAdmin) external onlyAdmin`
* `function allowSwapTarget(address _swapTarget) external onlySettings`
* `function denySwapTarget(address _swapTarget) external onlySettings`

It has the following external/public functions that are privileged and move underlying assets or trade assets:
* `function invest() external virtual override(IStrategy) onlyManager`
* `function withdrawToVault(uint256 amount) external virtual override(IStrategy) onlyManager`
* `function reinvest(address _swapTarget, uint256 _lqtyAmount, bytes calldata _lqtySwapData, uint256 _ethAmount, bytes calldata _ethSwapData, uint256 _amountOutMin) external virtual onlyKeeper`
* `function transferYield(address, uint256) external virtual override(IStrategy) onlyManager returns (uint256)`

It has the following external/public functions that move underlying assets:
* `function harvest() external virtual`

It has the following external/public functions that are view only and change nothing:
* `function investedAssets() public view virtual override(IStrategy) returns (uint256)`
* `function hasAssets() external view virtual override(IStrategy) returns (bool)`
* `function isSync() external pure override(IStrategy) returns (bool)`

## Properties

| No. | Property  | Category | Priority | Specified | Verified | Report |
| ---- | --------  | -------- | -------- | -------- | -------- | -------- |
| 1 | privileged functions should revert if the `msg.sender` does not have the privilege | high level | high | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd)  |
| 2 | `initialize(...)` can be called once only | unit test | high | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 3 |`invest()` should move all the LUSD from the strategy to stability pool | variable transition | high | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 4 |`reinvest(...)` should move all the LUSD from the strategy to stability pool | variable transition | high | Y | N | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 5 |`withdrawToVault(uint256 amount)` should withdraw LUSD to the Vault | variable transition | high | Y | N | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 6 |`harvest()` should claim ETH and LQTY rewards only and not change LUSD balance of any account | variable transition | high | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 7 |`investedAssets()` should return the amount of LUSD in the stability pool | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 8 |`hasAssets()` should return `true` if and only if `investedAssets() > 0` | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 9 |`isSync()` should return `true` | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 10 |`allowSwapTarget(address _swapTarget)` should whitelist the `_swapTarget` | variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 11 |`denySwapTarget(address _swapTarget)` should remove `_swapTarget` from the whitelist | variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 12 |`setMinPrincipalProtectionPct(uint16 _pct)` should set the `minPrincipalProtectionPct` to `_pct` | variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 13 |`transferAdminRights(address _newAdmin)` should transfer the admin rights from `msg.sender` to the `_newAdmin` | variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 14 |`invest()` reverts if the strategy does not hold any underlying assets | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |
| 15 |`withdrawToVault(amount)` reverts if the `amount` is 0 or greater than `investedAssets()` | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/2c1c9825c45644af873737047c4c5127?anonymousKey=6ef50d9dc3551c650f71ebbfcfcb0af4073011cd) |