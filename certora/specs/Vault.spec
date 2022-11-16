import "erc20.spec"

using MockStrategySync as strategy

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
    treasury() returns (address) envfree
    investPct() returns (uint16) envfree
    perfFeePct() returns (uint16) envfree
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

definition excludeSetInvestPct(method f) returns bool =
    f.selector != setInvestPct(uint16).selector;

definition excludeWithdrawals(method f) returns bool =
    f.selector != unsponsor(address, uint256[]).selector
    &&
    f.selector != partialUnsponsor(address, uint256[], uint256[]).selector
    &&
    f.selector != withdraw(address, uint256[]).selector
    &&
    f.selector != forceWithdraw(address, uint256[]).selector
    &&    
    f.selector != partialWithdraw(address, uint256[], uint256[]).selector
    &&
    f.selector != claimYield(address).selector
    &&
    f.selector != withdrawPerformanceFee().selector;

// PCT_DIVISOR constant in PercentMath lib
definition PCT_DIVISOR() returns uint256 = 10000;

// pctOf function in PercentMath lib
function pctOf(uint256 _amount, uint16 _fracNum) returns uint256 {
    return to_uint256(_amount * _fracNum / PCT_DIVISOR());
}

ghost sumOfDeposits() returns uint256 {
    init_state axiom sumOfDeposits() == 0;
}

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


ghost sumOfClaimerPrincipal() returns uint256  {
    init_state axiom sumOfClaimerPrincipal() == 0;
}

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


ghost sumOfClaimerShares() returns uint256   {
    init_state axiom sumOfClaimerShares() == 0;
}

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
        Any individual user's shares and principal should be less than or equal to the totals

    TODO - investigate violations in 
           https://prover.certora.com/output/15154/bbe90411a32bd6523963?anonymousKey=dff7a4fa037d1dfa4628b8fb4f8282fb6e091af0
           It looks due to uint arithmetic rounding
*/
invariant individual_shares_principal_le_total(address user)
    sharesOf(user) <= totalShares() 
    && 
    principalOf(user) <= totalPrincipal()
    &&
    (sharesOf(user) == totalShares() <=> principalOf(user) == totalPrincipal())
    &&
    (sharesOf(user) < totalShares() <=> principalOf(user) < totalPrincipal())
    {
        preserved {
            requireInvariant tatalPrincipal_equals_sum_of_claimer_principal();
            requireInvariant tatalShares_equals_sum_of_claimer_shares();
        }
    }

/*
    @Invariant

    @Description:
        the state variable totalShares' value should be consistent with the state variable totalPrincipal's value, i.e, 
        they are either both 0 or greater than 0
    
    TODO - investigate violations in
         - https://prover.certora.com/output/15154/e00d2330e3d97a4c0456?anonymousKey=c4d0aec081d477674ce00e68087456622605016c
           It looks due to uint arithmetic rounding
*/
invariant shares_principal_consistency()
    totalPrincipal() == 0 <=> totalShares() == 0 && totalPrincipal() > 0 <=> totalShares() > 0
    {
        preserved sharesOf(address user) {
            requireInvariant individual_shares_principal_le_total(user);
        }
        preserved principalOf(address user) {
            requireInvariant individual_shares_principal_le_total(user);
        }
    }


/*
    @Rule

    @Category: high level

    @Description:
        price per share, i.e., totalUnderlyingMinusSponsored() / totalShares should be preserved, or
        both totalUnderlyingMinusSponsored() and totalShares become 0 after any function calls.

    TODO - investigate violations in 
           https://prover.certora.com/output/15154/6f4601e838ab9a26adb0?anonymousKey=e1374529223eb7bf10fff0423b590617ec901648
*/
rule price_per_share_preserved(method f) {
    require totalUnderlyingMinusSponsored() != 0 && totalShares() != 0;
    uint256 pricePerShare = totalUnderlyingMinusSponsored() / totalShares();
    env e;
    require e.msg.sender != strategy; // safe to assume stragety will never call any function in Vault
    calldataarg args;
    f(e, args);
    assert 
        totalShares() == 0 && totalUnderlyingMinusSponsored() == 0 
        || 
        pricePerShare == totalUnderlyingMinusSponsored() / totalShares();
}


/*
    @Rule

    @Category: high level

    @Description:
        only claimYield, deposit and withdraw functions can change claimer's shares
*/
rule only_claim_deposits_withdraw_change_claimer_shares(address claimer, method f) {
    uint256 _shares = sharesOf(claimer);
    env e;
    calldataarg args;
    f(e, args);
    uint256 shares_ = sharesOf(claimer);
    assert _shares != shares_ =>
        (
            f.selector == claimYield(address).selector
            ||
            f.selector == deposit(address, uint64, uint256, uint16[], address[], bytes[], uint256).selector
            ||
            f.selector == deposit((address,uint64,uint256,(uint16,address,bytes)[],string,uint256)).selector
            ||
            f.selector == depositForGroupId(uint256, address, uint64, uint256, uint16[], address[], bytes[], uint256).selector
            ||
            f.selector == depositForGroupId(uint256, (address,uint64,uint256,(uint16,address,bytes)[],string,uint256)).selector
            ||
            f.selector == withdraw(address, uint256[]).selector
            ||
            f.selector == forceWithdraw(address, uint256[]).selector
            ||
            f.selector == partialWithdraw(address, uint256[], uint256[]).selector
        );
}


/*
    @Rule

    @Category: high level

    @Description:
        only deposit and withdraw functions can change claimer's principal
*/
rule only_deposits_withdraw_change_claimer_principal(address claimer, method f) {
    uint256 _principal = principalOf(claimer);
    env e;
    calldataarg args;
    f(e, args);
    uint256 principal_ = principalOf(claimer);
    assert _principal != principal_ =>
        (
            f.selector == deposit(address, uint64, uint256, uint16[], address[], bytes[], uint256).selector
            ||
            f.selector == deposit((address,uint64,uint256,(uint16,address,bytes)[],string,uint256)).selector
            ||
            f.selector == depositForGroupId(uint256, address, uint64, uint256, uint16[], address[], bytes[], uint256).selector
            ||
            f.selector == depositForGroupId(uint256, (address,uint64,uint256,(uint16,address,bytes)[],string,uint256)).selector
            ||
            f.selector == withdraw(address, uint256[]).selector
            ||
            f.selector == forceWithdraw(address, uint256[]).selector
            ||
            f.selector == partialWithdraw(address, uint256[], uint256[]).selector
        );
}


/*
    @Invariant

    @Description:
        Without a strategy or a strategy not making money, 
        investState().maxInvestableAmount >= investState().alreadyInvested
*/
invariant maxInvestableAmount_ge_alreadyInvested()
    maxInvestableAmount() >= alreadyInvested()
    filtered{f -> excludeSetInvestPct(f) && excludeWithdrawals(f)}
    

/*
    @Rule

    @Category: unit test

    @Description:
        maxInvestableAmount equals investPct of totalUnderlying()
*/
rule maxInvestableAmount_correct() {
    assert pctOf(totalUnderlying(), investPct()) == maxInvestableAmount();
}

/*
    @Rule

    @Category: unit test

    @Description:
        yield related calculations are correct

    TODO - investigate violations in
           https://prover.certora.com/output/15154/a439221a2ccf68065c8a?anonymousKey=e13c312d220aa0b0043efc4bd649ce2e11315c1b
           It looks due to uint arithmetic rounding
*/
rule yield_calculations_correct(address user) {
    // should be replaced with 
    // requireInvariant individual_shares_principal_le_total(user);
    // once the invariant is proved
    require sharesOf(user) <= totalShares() && principalOf(user) <= totalPrincipal();

    uint256 claimableYield = claimableYield(user);
    uint256 claimableShares = claimableShares(user);
    uint256 perfFee = perfFee(user);
    uint256 yield = claimableYield + perfFee;
    assert yield > 0 <=> claimableShares > 0;
    assert yield == 0 <=> claimableShares == 0;
    assert perfFee == pctOf(yield, perfFeePct());
}