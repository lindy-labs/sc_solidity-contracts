methods {
    // state changing functions
    deposit(address, uint64, uint256, uint16[], address[], bytes[], uint256)
    depositForGroupId(uint256, address, uint64, uint256, uint16[], address[], bytes[], uint256)
    withdraw(address, uint256[])
    forceWithdraw(address, uint256[])
    partialWithdraw(address, uint256[], uint256[])
    claimYield(address)
    sponsor(address, uint256, uint256, uint256)
    unsponsor(address, uint256[])
    partialUnsponsor(address, uint256[], uint256[])

    // admin/settings/keeper functions
    transferAdminRights(address)
    pause()
    unpause()
    exitPause()
    exitUnpause()
    addPool(address, address, int128, int128)
    removePool(address)
    setInvestPct(uint16)
    setTreasury(address)
    setPerfFeePct(uint16)
    setStrategy(address)
    setLossTolerancePct(uint16)
    updateInvested()
    withdrawPerformanceFee()

    // view functions
    maxInvestableAmount() returns (uint256) envfree
    alreadyInvested() returns (uint256) envfree
    claimableYield(address) returns (uint256) envfree
    claimableShares(address) returns (uint256) envfree
    perfFee(address) returns (uint256) envfree
    getUnderlying() returns (address) envfree
    totalUnderlying() returns (uint256) envfree
    totalUnderlyingMinusSponsored() returns (uint256) envfree
    sharesOf(address) returns (uint256) envfree
    principalOf(address) returns (uint256) envfree
    depositGroupOwner(uint256) returns (address) envfree
    depositAmount(uint256) returns (uint256) envfree
    depositOwner(uint256) returns (address) envfree
    depositClaimer(uint256) returns (address) envfree
    depositLockedUntil(uint256) returns (uint256) envfree

    // public variables
    totalSponsored() returns (uint256) envfree
    totalShares() returns (uint256) envfree
    totalPrincipal() returns (uint256) envfree
    accumulatedPerfFee() returns (uint256) envfree
    paused() returns (bool) envfree
    exitPaused() returns (bool) envfree
}

definition excludeSponsor(method f) returns bool =
    f.selector != sponsor(address, uint256, uint256, uint256).selector
    &&
    f.selector != unsponsor(address, uint256[]).selector
    &&
    f.selector != partialUnsponsor(address, uint256[], uint256[]).selector;


ghost sumOfDeposits() returns uint256;

hook Sstore deposits[KEY uint256 k].(offset 0) uint256 amount (uint256 oldAmount) STORAGE {
    havoc sumOfDeposits assuming sumOfDeposits@new() == sumOfDeposits@old() + (amount - oldAmount);
}

/*
    @Invariant

    @Description:
        the state variable totalPrincipal's value should be always equal to the sum of 
        deposits made by depositors (sponsors are not depositors)
*/
invariant tatalPrincipal_equals_sum_of_deposits()
    totalPrincipal() == sumOfDeposits()
    filtered{f -> excludeSponsor(f)}


ghost sumOfClaimerPrincipal() returns uint256;

hook Sstore claimer[KEY address k].(offset 0) uint256 amount (uint256 oldAmount) STORAGE {
    havoc sumOfClaimerPrincipal assuming sumOfClaimerPrincipal@new() == sumOfClaimerPrincipal@old() + (amount - oldAmount);
}

/*
    @Invariant

    @Description:
        the state variable totalPrincipal's value should be always equal to the sum of 
        claimer's principal
*/
invariant tatalPrincipal_equals_sum_of_claimer_principal()
    totalPrincipal() == sumOfClaimerPrincipal()


ghost sumOfClaimerShares() returns uint256;

hook Sstore claimer[KEY uint256 k].(offset 32) uint256 amount (uint256 oldAmount) STORAGE {
    havoc sumOfClaimerShares assuming sumOfClaimerShares@new() == sumOfClaimerShares@old() + (amount - oldAmount);
}

/*
    @Invariant

    @Description:
        the tate variable totalShares' value should be always equal to the sum of 
        claimer's shares
*/
invariant tatalShares_equals_sum_of_claimer_shares()
    totalShares() == sumOfClaimerShares()


/*
    @Invariant

    @Description:
        the state variable totalShares' value should be consistent with the state variable totalPrincipal's value, i.e, 
        they are either both 0 or greater than 0
*/
invariant shares_principal_consistency()
    totalPrincipal() == 0 <=> totalShares() == 0 && totalPrincipal() > 0 <=> totalShares() > 0
    {
        preserved {
            requireInvariant tatalPrincipal_equals_sum_of_claimer_principal();
            requireInvariant tatalShares_equals_sum_of_claimer_shares();
        }
    }