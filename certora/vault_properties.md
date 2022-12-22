# Properties of Vault

## Overview of the Vault

The Vault contract is the core of the SandClock system. It allows user to deposit funds to invest and withdraw funds to disinvest. It delegates investing activity to a contract that implements [`IStrategy`](https://github.com/lindy-labs/sc_solidity-contracts/blob/main/contracts/strategy/IStrategy.sol) interface. 

The main value added by Vault is allowing user to specify multiple beneficiaries in a very flexible way, which opens a lot of possibilities. It also allows sponsors to contribute yield to all the users while guaranteeing sponsors to be the last ones to bear investment loss.

It uses `shares` to keep track of users' entitlements to the underlying assets. Whenever user deposits accepted assets into the vault, the Vault will add a certain amount of shares against the user account. When user withdraws underlying assets, their shares are reduced.

Vault and Strategy is one-to-one relationship, i.e., each Vault can have only one strategy and vice versa.

The Vault has the following state variables:
* `totalSponsored` (type `uint256`), total sponsored amount of the underlying ERC20 asset
* `totalShares` (type `uint256`), total shares of the all the users
* `depositGroupIdOwner` (type `mapping(uint256 => address)`), a map from *depositGroupId* to its owner, where *depositGroupId* is an auto-increment uint256 starting with 0
* `deposits` (type `mapping(uint256 => Deposit)`), a map from *depositId* to `Deposit` data, where *depositId* is an auto-increment uint256 starting with 0
* `claimer` (type `mapping(address => Claimer)`), a map from claimer address to claimer data
* `totalPrincipal` (type `uint256`), the total principal deposited by users only (i.e., sponsor's deposit is not counted)
* `accumulatedPerfFee` (type `uint256`), accumulated performance fee
* `paused` (type `bool`), whether or not the Vault is paused, i.e., deposit or sponsor is disabled or not
* `exitPaused` (type `bool`), whether or not exit of the Vault is paused, i.e., withdraw is disabled or not

Below are quite static global settings, even though they are also state variables:
* `lossTolerancePct` (type `uint16`), loss tolerance percentage. It's specified in the constructor but can be updated by a *settings* account.
* `investPct` (type `uint16`), the percentage to invest by the Vault. Vault may leave some users' funds uninvested as reserve for user to withdraw anytime. It's specified in the constructor but can be updated by a *settings* account
* `perfFeePct` (type `uint16`), performance fee percentage. It's specified in the constructor but can be updated by a *settings* account.
* `strategy` (type `IStrategy`), the investing strategy used by the Vault. It's specified in the constructor but can be updated by a *settings* account.
* `treasury` (type `address`), the treasury where fees go to. It's specified in the constructor but can be updated by a *settings* account.
* `minLockPeriod` (type `uint64`), specified in the constructor and **immutable**. It's the allowed minimum lock time for any deposit.
* `underlying`  (type: `IERC20Metadata`), underlying ERC20 asset address. It should be consistent with the strategy's underlying asset. It's specified in the constructor.

The Vault has the following external/public functions that change state variables:

* `function deposit(DepositParams calldata _params) external nonReentrant whenNotPaused returns (uint256[] memory depositIds)`
* `function depositForGroupId(uint256 _groupId, DepositParams calldata _params) external nonReentrant whenNotPaused returns (uint256[] memory depositIds)`
* `function claimYield(address _to) external override(IVault) nonReentrant whenNotExitPaused`
* `function withdraw(address _to, uint256[] calldata _ids) external override(IVault) nonReentrant whenNotExitPaused`
* `function forceWithdraw(address _to, uint256[] calldata _ids) external nonReentrant whenNotExitPaused`
* `function partialWithdraw(address _to, uint256[] calldata _ids, uint256[] calldata _amounts) external nonReentrant whenNotExitPaused`
* `function sponsor(address _inputToken, uint256 _amount, uint256 _lockDuration, uint256 _slippage) external override(IVaultSponsoring) nonReentrant onlySponsor whenNotPaused`
* `function unsponsor(address _to, uint256[] calldata _ids) external nonReentrant whenNotExitPaused`
* `function partialUnsponsor(address _to, uint256[] calldata _ids, uint256[] calldata _amounts) external nonReentrant whenNotExitPaused`

It has the following external/public functions that are privileged and change settings:

* `function transferAdminRights(address _newAdmin) external onlyAdmin`
* `function pause() external onlyAdmin`
* `function unpause() external onlyAdmin`
* `function exitPause() external onlyRole(DEFAULT_ADMIN_ROLE)`
* `function exitUnpause() external onlyRole(DEFAULT_ADMIN_ROLE)`
* `function addPool(SwapPoolParam memory _param) external onlyAdmin`
* `removePool(address _inputToken) external onlyAdmin`
* `function setInvestPct(uint16 _investPct) external override(IVaultSettings) onlySettings`
* `function setTreasury(address _treasury) external override(IVaultSettings) onlySettings`
* `function setPerfFeePct(uint16 _perfFeePct) external override(IVaultSettings) onlySettings`
* `function setStrategy(address _strategy) external override(IVaultSettings) onlySettings`
* `function setLossTolerancePct(uint16 pct) external override(IVaultSettings) onlySettings`

It has the following external/public functions that are privileged and move underlying assets:
* `function updateInvested() external override(IVault) onlyKeeper`
* `function withdrawPerformanceFee() external override(IVault) onlyKeeper`

It has the following external/public functions that are view only and change nothing:
* `function investState() public view override(IVault) returns (uint256 maxInvestableAmount, uint256 alreadyInvested)`
* `function getUnderlying() public view override(CurveSwapper) returns (address)`
* `function totalUnderlying() public view override(IVault) returns (uint256)`
* `function yieldFor(address _to) public view override(IVault) returns (uint256 claimableYield, uint256 shares, uint256 perfFee)`
* `function totalUnderlyingMinusSponsored() public view returns (uint256)`
* `function sharesOf(address claimerId) external view returns (uint256)`
* `function principalOf(address claimerId) external view returns (uint256)`
* `function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, AccessControl) returns (bool)`
* `function paused() public view virtual returns (bool)` (inherited from `Pausable.sol`)
* `function exitPaused() public view virtual returns (bool)` (inherited from `ExitPausable.sol`)
## Properties

| No. | Property  | Category | Priority | Specified | Verified | Report |
| ---- | --------  | -------- | -------- | -------- | -------- | -------- |
| 1 | `totalShares == sum(Claimer.totalShares)` | high-level | high | Y | Y | [Link](https://prover.certora.com/output/52311/f8bd689ce9178e10bada?anonymousKey=dc157a4e284d33644e5041996ef0290f0e751c09) |
| 2 | `totalPrincipal == sum(Claimer.totalPrincipal)` | high-level | high | Y | Y | [Link](https://prover.certora.com/output/52311/fbcb5ecaf0ac8c7bef30?anonymousKey=0313bb61c82bef827622006acbc74ad46d3d03c3) |
| 3 | `sharesOf(claimer)` changes only if `claimYield(...)`, `deposit(...)`, `depositForGroupId(...)`, `withdraw(...)`, `forceWithdraw(...)` or `partialWithdraw(...)` is called | high-level | high | Y | Y | [Link](https://prover.certora.com/output/15154/6077e741f7b60ccb25bf?anonymousKey=493be4dceda848e5cb6193eb7aa1c4e761edf4eb) |
| 4 | `principal(claimer)` changes only if `deposit(...)`, `depositForGroupId(...)`, `withdraw(...)`, `forceWithdraw(...)`, or `partialWithdraw(...)`is called | high-level | high | Y | Y | [Link](https://prover.certora.com/output/15154/574d79e5f159811ef58b/?anonymousKey=07a6ee9f21abf4543dfda70d1b92fc7883cea848) |
| 5 | Without a strategy or a strategy not making money, `investState().maxInvestableAmount >= investState().alreadyInvested` | high-level | medium | Y | Y | [Link](https://prover.certora.com/output/15154/6d0dfd60b24a7a3f309f?anonymousKey=dc4be13adbfec86b1a7b350680b5801ddeba56be) |
| 6 | `address(underlying()) == getUnderlying()` | high-level | medium | Y | Y | [Link](https://prover.certora.com/output/15154/38696977af74c5831d7c?anonymousKey=cee29438d21eba0fe2f0f973a0b2b8e518848828) |
| 7 | Without any strategy or with a strategy doing nothing, `totalUnderlying() == underlying.balanceOf(vault) + underlying.balanceOf(strategy)` | high-level | high | Y | Y | [Link](https://prover.certora.com/output/15154/a18606b1923487c653b1?anonymousKey=a22101b45deb02cae33d04cbddfd6a2b9c14f7c0) |
| 8 | `deposit(...)` the underlying token should reduce the user's balance by the specified amount while increasing Vault's balance by the same amount. It should also increase claimer's `totalShares` and the Vault's `totalShares` by the same amount. | variable transition | high | Y | Y | [Link](https://prover.certora.com/output/52311/70dc72f06ea6b5db951b?anonymousKey=52ee8a54aa543fef49d2eca27ba08f7a161fe042) |
| 9 | `deposit(param)` and `depositForGroupId(groupId, param)` are equivalent in changing `totalShares`, `totalPrincipal`, `claimer` and `deposits` state variables | variable transition | high | Y | Y | [Link](https://prover.certora.com/output/52311/2238d78ea7fc53897207?anonymousKey=bd74bdea01515a22c5da5e1c8162175ed82b961c) |
| 10 | `withdraw(...)` should decrease `totalShares`, `totalPrincipal`, `claimer's totalShares`, `claimer's totalPrincipal`. The `totalPrincipal` decreased  should be the same as the `totalUnderlying()` decreased, and the `underlying.balanceOf(user)` increased.| variable transition | high | Y | N | [Link](https://prover.certora.com/output/52311/e5fd4ff2d53383d825c5?anonymousKey=6ca78ad9eb92a88b75f60da30543ac8c48d7d11b) |
| 11 | `partialWithdraw(...)` should decrease `totalShares`, `totalPrincipal`, `claimer's totalShares`, `claimer's totalPrincipal` by specified `amounts`. The `totalPrincipal` decreased  should be the same as the `totalUnderlying()` decreased, and the `underlying.balanceOf(user)` increased. | variable transition | high | Y | N | [Link](https://prover.certora.com/output/52311/e2d4e7c61ddeb402dc70?anonymousKey=7369516eee332ea847a38028475c4fd845bcb1ce) |
| 12 | `forceWithdraw(...)` should decrease `totalShares`, `totalPrincipal`, `totalUnderlying()`, increase user's balance. The deposits should be 0. Share price should be preserved.  | variable transition | high | Y | Y | [Link](https://prover.certora.com/output/52311/186b775102b4a824f4d0?anonymousKey=f7b7b287550a04941b43eb4931fbfcf433ec1e51) |
| 13 | `sponsor(...)` should reduce `underlying.balanceOf(sponsor)` by the specified `amount` and increase `totalUnderlying()` by the same `amount` | variable transition | high | Y | Y | [Link](https://prover.certora.com/output/52311/d550bb44903a6be26201?anonymousKey=e11af93d36f49de26069c142ce5e3e7e1c8657ff) |
| 14 | `unsponsor(...)` should increase `underlying.balanceOf(sponsor)` and decrease `totalUnderlying()` by the same `amount` | variable transition | high | Y | Y | [Link](https://prover.certora.com/output/52311/f514f23e993c2942757b?anonymousKey=39c7b6c9a44b4330a8515ad145904daf5067caae) |
| 15 | `partialUnsponsor(...)` should increase `underlying.balanceOf(sponsor)` by the specified `amounts` and decrease `totalUnderlying()` by the same `amounts` | variable transition | high | Y | Y | [Link](https://prover.certora.com/output/52311/62723baab779fef69490?anonymousKey=39ad2f786d39dbf3800e0e5bcfa35dfc59b4b09c) |
| 16 | privileged settings functions work as expected  | variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/de65c719888d1092437b?anonymousKey=660b4665a71967836d0d13eeabafdef27b50e481) |
| 17 | `withdrawPerformanceFee() => underlying.balanceOf(treasury) increases by accumulatedPerfFee && accumulatedPerfFee becomes 0` | variable transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/a2166eb143821f6ae3b5?anonymousKey=2ee5d017357745a26210c8369b2a69399e5d7230) |
| 18 | `pause() => paused() == true` | state transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/46dc4a761417066a91f8?anonymousKey=d571fc839faf1dcf99f86fe7fa63d11f86114dfb) |
| 19 | `unpause() => paused() == false` | state transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/46dc4a761417066a91f8?anonymousKey=d571fc839faf1dcf99f86fe7fa63d11f86114dfb) |
| 20 | `exitPause() => exitPaused() == true` | state transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/46dc4a761417066a91f8?anonymousKey=d571fc839faf1dcf99f86fe7fa63d11f86114dfb) |
| 21 | `exitUnpause() => exitPaused() == false` | state transition | medium | Y | Y | [Link](https://prover.certora.com/output/52311/46dc4a761417066a91f8?anonymousKey=d571fc839faf1dcf99f86fe7fa63d11f86114dfb) |
| 22 | `yieldFor(someone).claimableYield + yieldFor(someone).perfFee > 0 => yieldFor(someone).shares > 0`, `perfFee == (yieldFor(someone).claimableYield + yieldFor(someone).perfFee).pctOf(perfFeePct)`,  `yieldFor(someone).shares == 0 => yieldFor(someone).claimableYield + yieldFor(someone).perfFee == 0` | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/5c4be9710c83c34d4713?anonymousKey=26a6b26cb2b7de0f5637e52565ac4a9105cf7845) |
| 23 | `totalUnderlying().pctOf(investPct) == investState().maxInvestableAmount` | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/15154/608d6f01fdb22c0dfd60?anonymousKey=6fcfc4e4ff3cd49dd84774e9948c4476944d1016) |
| 24 | `totalUnderlyingMinusSponsored() < totalPrincipal => withdraw(...) reverts` | unit test | high | Y | Y | [Link](https://prover.certora.com/output/52311/b2cdcb0ae3fc1100d49a?anonymousKey=372a59f85fa0b18ff6ac9508520c4255dcb995db) |
| 25 | `updateInvested()` should function according to `investState()` | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/b1ebf9b7b29a437483e0?anonymousKey=0511743c9de49437cfc10eae845a93e2e8169ab7) |
| 26 | `paused() => deposit(...), depositForGroupId(...) and sponsor(...) always revert` | unit test | high | Y | Y | [Link](https://prover.certora.com/output/52311/1f4deeed03cc915844db?anonymousKey=370acab0e32a2bdfe5c6f0996d28162c3d9cd3a0) |
| 27 | `deposit(invalidParam) always reverts`, where `invalidParam` could be `amount==0`, or `claim.pct == 0`, or `sum(claim.pct) != 100`, or `lockDuration` is out of range, or `inputToken` is invalid | unit test | high | Y | Y | [Link](https://prover.certora.com/output/52311/1ff49694c198950aa8ed?anonymousKey=28ed657e1dbebd1b30580bad3d67ae850d2eee4d) |
| 28 | `sponsor(invalidParam) always reverts`, where `invalidParam` could be `amount==0`, or `lockDuration` is out of range, or `inputToken` is invalid | unit test | high | Y | Y | [Link](https://prover.certora.com/output/52311/3a5e7d89214c965323f2?anonymousKey=28157f619622668711c7ef5eaafbd6d8eda4db17) |
| 29 | `exitPaused() => withdraw(...), partialWithdraw(...), forceWithdraw(...), claimYield(...) and unsponsor(...) always revert` | unit test | high | Y | Y | [Link](https://prover.certora.com/output/52311/8192568bb07e386b3809?anonymousKey=4b1a56752d3664bbafa85997c4eec83a53fba10f) |
| 30 | `totalUnderlyingMinusSponsored() == totalUnderlying() - totalSponsored - accumulatedPerfFee` | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/15154/4b2c0be038cb5ab3d1cc?anonymousKey=3fb7818a868990500c964aded0a5842770bab570) |
| 31 | `withdraw(...)` reverts if lock duration has not passed yet | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/6b6c2c4d9ca1690949af?anonymousKey=4358d09ef16511052fac96589af9890028fdc580) |
| 32 | `withdraw(...)` reverts if the user didn't make the deposits | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/52311/4b79fd8101412aeac3e4?anonymousKey=b1f8c176b7c85879a83a53a769f2c3e8b16beef3) |

