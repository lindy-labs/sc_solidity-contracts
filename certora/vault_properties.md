# Properties of Vault

## Overview of the Vault

The Vault contract is the core of the SandClock system. It allows user to deposit funds to invest and withdraw funds to divest while delegating investing activity to a contract that implements [`IStrategy`](https://github.com/lindy-labs/sc_solidity-contracts/blob/main/contracts/strategy/IStrategy.sol) interface. 

The main value added by Vault is that it allows user to specify multiple beneficiaries in a very flexible way, which opens a lot of possibilities. It also allows sponsors to contribute yield to all the users while guaranteeing sponsors to be the last ones to bear investment loss.

It uses `shares` to keep track of users' entitlements to underlying assets. Whenever user deposits accepted assets into the vault, the Vault will add a certain amount of shares against the user account. When user withdraws underlying assets, their shares are reduced.

Vault and Strategy is one-to-one relationship. Each Vault can have only one strategy and vice versa.

The Vault has the following state variables:
* `totalSponsored` (type `uint256`), total sponsored amount of the underlying ERC20 asset
* `totalShares` (type `uint256`), total shares of the all the users
* `depositGroupIdOwner` (type `mapping(uint256 => address)`), a map from *depositGroupId* to its owner.
* `deposits` (type `mapping(uint256 => Deposit)`), a map from *depositId* to `Deposit` data
* `claimer` (type `mapping(address => Claimer)`), a map from claimer address to claimer data
* `totalPrincipal` (type `uint256`), the total principal deposited by users only (i.e., sponsor's deposit is not counted)
* `accumulatedPerfFee` (type `uint256`), accumulated performance fee

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
## Properties

| Property  | Category | Priority | Specified | Verified|
| --------  | -------- | -------- | -------- | -------- |
|   |  |  |  |  |  

