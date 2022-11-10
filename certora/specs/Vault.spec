methods {
    // state changing functions
    // TODO - add helper functions to VaultHarness, as certora does not support the following
    // deposit(DepositParams calldata _params) returns (uint256[] memory depositIds) 
    // depositForGroupId(uint256 _groupId, DepositParams calldata _params) returns (uint256[] memory depositIds)
    // withdraw(address _to, uint256[] calldata _ids)
    // forceWithdraw(address _to, uint256[] calldata _ids)
    // partialWithdraw(address _to, uint256[] calldata _ids, uint256[] calldata _amounts)
    // unsponsor(address _to, uint256[] calldata _ids)
    // partialUnsponsor(address _to, uint256[] calldata _ids, uint256[] calldata _amounts)
    claimYield(address)
    sponsor(address, uint256, uint256, uint256)

    // admin/settings/keeper functions
    transferAdminRights(address)
    pause()
    unpause()
    exitPause()
    exitUnpause()
    // TODO - add helper function to VaultHarness, as certora does not support the following
    // addPool(SwapPoolParam memory _param)
    removePool(address)
    setInvestPct(uint16)
    setTreasury(address)
    setPerfFeePct(uint16)
    setStrategy(address)
    setLossTolerancePct(uint16)
    updateInvested()
    withdrawPerformanceFee()

    // view functions
    // TODO - add helper functions to VaultHarness, as certora does not support the following
    // investState() returns (uint256 maxInvestableAmount, uint256 alreadyInvested)
    // yieldFor(address _to) returns (uint256 claimableYield, uint256 shares, uint256 perfFee)
    getUnderlying() returns (address) envfree
    totalUnderlying() returns (uint256) envfree
    totalUnderlyingMinusSponsored() returns (uint256) envfree
    sharesOf(address claimerId) returns (uint256) envfree
    principalOf(address claimerId) returns (uint256) envfree

    // public variables
    totalSponsored() returns (uint256) envfree
    totalShares() returns (uint256) envfree
    totalPrincipal() returns (uint256) envfree
    accumulatedPerfFee() returns (uint256) envfree
    paused() returns (bool) envfree
    exitPaused() returns (bool) envfree
    // TODO - add helper functions to VaultHarness, as certora does not support the following
    // depositGroupIdOwner mapping(uint256 => address)
    // deposits mapping(uint256 => Deposit)
    // claimer mapping(address => Claimer)
}