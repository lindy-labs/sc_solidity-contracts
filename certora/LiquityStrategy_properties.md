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
| 1 | privileged functions should revert if the `msg.sender` does not have the privilege | high level | high | Y | Y | [Link](https://prover.certora.com/output/52311/99e98a0e6c88e4acc7f3?anonymousKey=9e80b8f1015d06e2a2eb7a57ffb866cb6ea78e31)  |
| 2 | `initialize(...)` can be called once only | unit test | high | Y | Y | [Link](https://prover.certora.com/output/52311/b3fe8eee8fcc87eeb4f5?anonymousKey=d5b3e409f841b1c0fbba2de25eb4dbe82836a441) |
| 3 |`invest()` should move all the LUSD from the strategy to stability pool | variable transition | high | Y | Y | [Link](https://prover.certora.com/output/52311/51da855d0e8859c5aa30?anonymousKey=8054948066c9d22419805a2cf4bd9ed5f04b7f00) |
| 4 |`reinvest(...)` should move all the LUSD from the strategy to stability pool | variable transition | high | Y | N | [Link](https://prover.certora.com/output/52311/9b6e70204520a3924f8c?anonymousKey=48e35a3e7d84b7c40985cb0ce0ddb018d138751c) |
| 5 |`withdrawToVault(uint256 amount)` should withdraw amount of LUSD to the Vault | variable transition | high | Y | N | [Link](https://prover.certora.com/output/52311/2641031f800d222c31cf?anonymousKey=8853c22692ac78847e7eee5fa63233ceee73e608) |
| 6 |`harvest()` should claim ETH and LQTY rewards only and not change LUSD balance of any account | variable transition | high | Y | Y | [Link](https://prover.certora.com/output/52311/014cf99288f782370f71?anonymousKey=e783b0947cba344bbe848add940a9faa6c9a1057) |
| 7 |`investedAssets()` should return the amount of LUSD in the stability pool | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/e9c21e26f79e865972fd?anonymousKey=87328ded6790376016193152bd8c0e57b76f4b69) |
| 8 |`hasAssets()` should return `true` if and only if `investedAssets() > 0` | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/392999e2b662f2b2feaf?anonymousKey=817ce2fe2f282b8da8910e4e5166b7b57a01f583) |
| 9 |`isSync()` should return `true` | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/f033580f328bf0860287?anonymousKey=a678bacce295d67d1a316d43169ad451339cae14) |
| 10 |`allowSwapTarget(address _swapTarget)` should whitelist the `_swapTarget` | variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/3a0acecfc2cc7ba9b04c?anonymousKey=bc0ab8068bd4c2da2fd3834a96dd637d6a6dd1bf) |
| 11 |`denySwapTarget(address _swapTarget)` should remove `_swapTarget` from the whitelist | variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/316e2e79b2d7f01f3c68?anonymousKey=6137aa6c48e20c4772163f19be91300ee4a33f9f) |
| 12 |`setMinPrincipalProtectionPct(uint16 _pct)` should set the `minPrincipalProtectionPct` to `_pct` | variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/29b5e566d0e1c75e5161?anonymousKey=bb611c6b3d2bdf42749d22e369aeaa538f5ebe78) |
| 13 |`transferAdminRights(address _newAdmin)` should transfer the admin rights from `msg.sender` to the `_newAdmin` | variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/0d1695d53e5ad367dc11?anonymousKey=2130ac0979f007c4313f43f7814883a312741091) |