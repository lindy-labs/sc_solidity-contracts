# Properties of Vault

## Overview of the Vault

The Vault contract is the core of the SandClock system. It allows user to deposit funds to invest and withdraw funds to disinvest. It delegates investing activity to a contract that implements [`IStrategy`](https://github.com/lindy-labs/sc_solidity-contracts/blob/main/contracts/strategy/IStrategy.sol) interface. 

The main value added by Vault is allowing user to specify multiple beneficiaries in a very flexible way, which opens a lot of possibilities. It also allows sponsors to contribute yield to all the users while guaranteeing sponsors to be the last ones to bear investment loss.

It uses `shares` to keep track of users' entitlements to the underlying assets. Whenever user deposits accepted assets into the vault, the Vault will add a certain amount of shares against the user account. When user withdraws underlying assets, their shares are reduced.

Vault and Strategy is one-to-one relationship, i.e., each Vault can have only one strategy and vice versa.

The Vault has the following state variables:
* `totalSponsored` (type `uint256`), total sponsored amount of the underlying ERC20 asset
* `totalShares` (type `uint256`), total shares of the all the users
* `depositGroupIdOwner` (type `mapping(uint256 => address)`), a map from *depositGroupId* to its owner.
* `deposits` (type `mapping(uint256 => Deposit)`), a map from *depositId* to `Deposit` data
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
| 1 | `totalShares > 0 <=> totalPrincipal > 0 && totalShares == 0 <=> totalPrincipal == 0` | high-level | high | N | N |
| 2 | `totalShares == sum(Claimer.totalShares)` | high-level | high | Y | Y | [Link](https://prover.certora.com/output/15154/a7de4231d7d4259f95de?anonymousKey=c2cacd02cda873ebf96f8dd18548f09a35f1c9b6) |
| 3 | `totalPrincipal == sum(Claimer.totalPrincipal)` | high-level | high | Y | Y | [Link](https://prover.certora.com/output/15154/ae913e6777bf0285d1a7?anonymousKey=7fc9fa32e73b1def14730d2311bb203470884418) |
| 4 | individual user's shares and principal not greater than the `totalShares` and `totalPrincipal` | high-level | high | Y | N |  |
| 5 | `totalPrincipal == sum(Deposit.amount)` | high-level | high | Y | N |
| 6 | Without a strategy or a strategy doing nothing, price per share are preserved or both `totalShares` and `totalUnderlyingMinusSponsored()` become `0`| high-level | high | Y | N |
| 7 | `sharesOf(claimer)` changes only if `claimYield(...)`, `deposit(...)`, `depositForGroupId(...)`, `withdraw(...)`, `forceWithdraw(...)` or `partialWithdraw(...)` is called | high-level | high | Y | Y | [Link](https://prover.certora.com/output/15154/6077e741f7b60ccb25bf?anonymousKey=493be4dceda848e5cb6193eb7aa1c4e761edf4eb) |
| 8 | `principal(claimer)` changes only if `deposit(...)`, `depositForGroupId(...)`, `withdraw(...)`, `forceWithdraw(...)`, or `partialWithdraw(...)`is called | high-level | high | Y | Y | [Link](https://prover.certora.com/output/15154/574d79e5f159811ef58b/?anonymousKey=07a6ee9f21abf4543dfda70d1b92fc7883cea848) |
| 9 | Without a strategy or a strategy not making money, `investState().maxInvestableAmount >= investState().alreadyInvested` | high-level | medium | Y | [Link](https://prover.certora.com/output/15154/6d0dfd60b24a7a3f309f?anonymousKey=dc4be13adbfec86b1a7b350680b5801ddeba56be) |
| 10 | `address(underlying()) == getUnderlying()` | high-level | medium | N | N |
| 11 | Without any strategy or with a strategy doing nothing, `totalUnderlying() == totalPrincipal + totalSponsored` | high-level | high | N | N |
| 12 | Without any strategy or with a strategy doing nothing, `totalUnderlyingMinusSponsored() == totalPrincipal` | high-level | high | N | N |
| 13 | Without any strategy or with a strategy not making money, `accumulatedPerfFee == 0` | high-level | medium | N | N |
| 14 | Without any strategy or with a strategy not making money, `yieldFor(anyone) == (0, 0, 0)` | high-level | medium | N | N |
| 15 | With a strategy making money, `totalUnderlying() == totalPrincipal + totalSponsored + sum(yieldFor(user).claimableYield + yieldFor(user).perfFee)` | high-level | high | N | N |
| 16 | With a strategy making money, `totalUnderlyingMinusSponsored() == totalPrincipal + sum(yieldFor(user).claimableYield + yieldFor(user).perfFee)` | high-level | high | N | N |
| 17 | `(deposits[id].amount == 0 <=> deposits[id].owner == 0 <=> deposits[id].claimerId == 0 <=> deposits[id].lockUntil == 0) && (deposits[id].amount != 0 <=> deposits[id].owner != 0 <=> deposits[id].claimerId != 0 <=> deposits[id].lockUntil != 0)` | high-level | low | N | N |
| 18 | `deposit(param)` and `depositForGroupId(groupId, param)` are equivalent in changing `totalShares`, `totalPrincipal`, `claimer` and `deposits` state variables | variable transition | high | N | N |
| 19 | `deposit(...)` the underlying token should reduce the user's balance by the specified amount while increasing Vault's balance by the same amount. It should also increase claimer's `totalShares` and the Vault's `totalShares` by the same amount. `depositGroupIdOwner[groupId]` should be updated from 0 address to the `msg.sender` | variable transition | high | N | N |
| 20 | `withdraw(...)` should decrease `totalShares`, `totalPrincipal`, `claimer's totalShares`, `claimer's totalPrincipal`. The `totalPrincipal` decreased  should be the same as the `totalUnderlying()` decreased, and the `underlying.balanceOf(user)` increased.| variable transition | high | N | N |
| 21 | `forceWithdraw(...)` should decrease `totalShares`, `totalPrincipal`, `claimer's totalShares`, `claimer's totalPrincipal`. The `totalPrincipal` decreased  should be the same as the `totalUnderlying()` decreased, and the `underlying.balanceOf(user)` increased. | variable transition | high | N | N |
| 22 | `partialWithdraw(...)` should decrease `totalShares`, `totalPrincipal`, `claimer's totalShares`, `claimer's totalPrincipal` by specified `amounts`. The `totalPrincipal` decreased  should be the same as the `totalUnderlying()` decreased, and the `underlying.balanceOf(user)` increased. | variable transition | high | N | N |
| 23 | `sponsor(...)` should reduce `underlying.balanceOf(sponsor)` by the specified `amount` and increase `totalUnderlying()` by the same `amount` | variable transition | high | N | N |
| 24 | `unsponsor(...)` should increase `underlying.balanceOf(sponsor)` and decrease `totalUnderlying()` by the same `amount` | variable transition | high | N | N |
| 25 | `partialUnsponsor(...)` should increase `underlying.balanceOf(sponsor)` by the specified `amounts` and decrease `totalUnderlying()` by the same `amounts` | variable transition | high | N | N |
| 26 | privileged settings functions work as expected  | variable transition | medium | N | N |
| 27 | `withdrawPerformanceFee() => underlying.balanceOf(treasury) increases by accumulatedPerfFee && accumulatedPerfFee becomes 0` | variable transition | medium | N | N |
| 28 | `pause() => paused() == true` | state transition | medium | N | N |
| 29 | `unpause() => paused() == false` | state transition | medium | N | N |
| 30 | `exitPause() => exitPaused() == true` | state transition | medium | N | N |
| 31 | `exitUnpause() => exitPaused() == false` | state transition | medium | N | N |
| 32 | Without any strategy or with a strategy not losing money, `!paused() => deposit(...) with valid params never reverts` | unit test | high | N | N |
| 33 | `yieldFor(someone).claimableYield + yieldFor(someone).perfFee > 0 <=> yieldFor(someone).shares > 0`, `perfFee == (yieldFor(someone).claimableYield + yieldFor(someone).perfFee).pctOf(perfFeePct)` | unit test | medium | Y | N |
| 34 | `perfFeePct == 0 => yieldFor(anyone).perfFee == 0` | unit test | medium | N | N |
| 35 | `anyGroupId > currentGroupId => depositGroupIdOwner[anyGroupId] == 0 && anyGroupId < currentGroupId => depositGroupIdOwner[anyGroupId] != 0`  | unit test | low | N | N |
| 36 | `totalUnderlying().pctOf(investPct) == investState().maxInvestableAmount` | unit test | medium | Y | Y | [Link](https://prover.certora.com/output/15154/608d6f01fdb22c0dfd60?anonymousKey=6fcfc4e4ff3cd49dd84774e9948c4476944d1016) |
| 37 | `totalUnderlyingMinusSponsored() < totalPrincipal => withdraw(param) reverts` | unit test | high | N | N |
| 38 | `totalUnderlyingMinusSponsored() >= totalPrincipal => withdraw(validParam) never reverts` | unit test | high | N | N |
| 39 | `totalUnderlyingMinusSponsored() >= totalPrincipal => partialWithdraw(validParam) never reverts` | unit test | high | N | N |
| 40 | `updateInvested()` should function according to `investState()` | unit test | medium | N | N |
| 41 | depositor can never withdraw more than deposited by calling `withdraw(...)`, `forceWithdraw(...)` and `partialWithdraw(...)` functions | unit test | high | N | N |
| 42 | sponsor can never unsponsor more than sponsored | unit test | high | N | N |
| 43 | `paused() => deposit(...), depositForGroupId(...) and sponsor(...) always revert` | unit test | high | N | N |
| 44 | `deposit(invalidParam) always reverts`, where `invalidParam` could be `amount==0`, or `claim.pct == 0`, or `sum(claim.pct) != 100`, or `lockDuration` is out of range, or `inputToken` is invalid | unit test | high | N | N |
| 45 | `sponsor(invalidParam) always reverts`, where `invalidParam` could be `amount==0`, or `lockDuration` is out of range, or `inputToken` is invalid | unit test | high | N | N |
| 46 | `exitPaused() => withdraw(...), partialWithdraw(...), forceWithdraw(...), claimYield(...) and unsponsor(...) always revert` | unit test | high | N | N |

