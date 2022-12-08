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
| | privileged functions should revert if the `msg.sender` does not have the privilege | high level | high | N | N | |
| |`invest()` should move all the LUSD from the strategy to stability pool | variable transition | high | N | N | |
| |`reinvest(...)` should move all the LUSD from the strategy to stability pool | variable transition | high | N | N | |
| |`withdrawToVault(uint256 amount)` should withdraw amount of LUSD from the stability pool and transfer them to the Vault | variable transition | high | N | N | |
| |`withdrawToVault(uint256 amount)` should fail if the `amount` exceeds the strategy's LUSD in the stability pool | unit test | high | N | N | |
| |`harvest()` should claim ETH and LQTY rewards only and not change LUSD balance of any account | variable transition | high | N | N | |
| |`transferYield(address, uint256)` does nothing | variable transition | medium | N | N | |
| |`investedAssets()` should return the amount of LUSD in the stability pool | unit test | medium | N | N | |
| |`hasAssets()` should return `true` if and only if `investedAssets() > 0` | unit test | medium | N | N | |
| |`isSync()` should return `true` | unit test | medium | N | N | |
| |`allowSwapTarget(address _swapTarget)` should whitelist the `_swapTarget` | variable transition | medium | N | N | |
| |`denySwapTarget(address _swapTarget)` should remove `_swapTarget` from the whitelist | variable transition | medium | N | N | |
| |`setMinPrincipalProtectionPct(uint16 _pct)` should set the `minPrincipalProtectionPct` to `_pct` | variable transition | medium | N | N | |
| |`transferAdminRights(address _newAdmin)` should transfer the admin rights from `msg.sender` to the `_newAdmin` | variable transition | medium | N | N | |
