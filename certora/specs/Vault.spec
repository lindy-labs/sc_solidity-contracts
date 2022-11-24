import "erc20.spec"

using MockStrategySync as strategy
using MockLUSD as underlying

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
    totalSharesOf(address[]) returns (uint256) envfree
    totalPrincipalOf(address[]) returns (uint256) envfree
    totalDeposits(uint256[]) returns (uint256) envfree
    totalSharesOf(uint256[]) returns (uint256) envfree
    totalPrincipalOf(uint256[]) returns (uint256) envfree
    totalAmount(uint256[]) returns (uint256) envfree
    hasRole(bytes32, address) returns (bool) envfree
    getCurvePool(address) returns (address) envfree
    anyZero(uint16[]) returns (bool) envfree
    isTotal100Pct(uint16[]) returns (bool) envfree
    anyZero(address[]) returns (bool) envfree

    // public variables
    underlying() returns (address) envfree
    strategy() returns (address) envfree
    minLockPeriod() returns (uint64) envfree
    treasury() returns (address) envfree
    investPct() returns (uint16) envfree
    perfFeePct() returns (uint16) envfree
    lossTolerancePct() returns (uint16) envfree
    totalSponsored() returns (uint256) envfree
    totalShares() returns (uint256) envfree
    totalPrincipal() returns (uint256) envfree
    accumulatedPerfFee() returns (uint256) envfree
    paused() returns (bool) envfree
    exitPaused() returns (bool) envfree
    DEFAULT_ADMIN_ROLE() returns (bytes32) envfree
    MAX_DEPOSIT_LOCK_DURATION() returns (uint64) envfree
    MIN_SPONSOR_LOCK_DURATION() returns (uint64) envfree
    MAX_SPONSOR_LOCK_DURATION() returns (uint64) envfree

    // erc20
    underlying.balanceOf(address) returns (uint256) envfree
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

definition rebalanceMinimum() returns uint256 = 10 * 10^18;    

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
*/
invariant consistency_of_shares_and_principal()
    totalPrincipal() > 0 => totalShares() > 0 && totalShares() == 0 => totalPrincipal() == 0
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
    require e.msg.sender != strategy; // safe to assume strategy will never call any function in Vault
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
    @Invariant

    @Description:
        the underlying public variable should always be the same with the return value of getUnderlying() function
*/
invariant same_underlying()
    underlying() == getUnderlying()


/*
    @Invariant

    @Description:
        With the basic strategy that does nothing, totalUnderlying() value should always equal 
        sum of the vault and strategy's balances of the underlying token
*/
invariant totalUnderlying_correct()
    totalUnderlying() == underlying.balanceOf(currentContract) + underlying.balanceOf(strategy)
    

/*
    @Invariant

    @Description:
        With the basic strategy that does nothing, 
        the totalUnderlyingMinusSponsored() value should always equal totalPrincipal

    TODO - investigate violations in
           https://prover.certora.com/output/15154/03ef82f0c00d42ecca77?anonymousKey=88fbc6398fa94b31d7dac352bffe21e86f968566
*/
invariant totalUnderlyingMinusSponsored_eq_totalPrincipal(method f)
    totalUnderlyingMinusSponsored() == totalPrincipal()
    {
        preserved with (env e) {
            require accumulatedPerfFee() == 0; // no performance fee
            require claimableYield(e.msg.sender) == 0; // no yield
            if (
                f.selector == deposit((address, uint64, uint256,(uint16, address, bytes)[],string,uint256)).selector
                ||
                f.selector == depositForGroupId(uint256,(address,uint64,uint256,(uint16,address,bytes)[],string,uint256)).selector
                ||
                f.selector == sponsor(address,uint256,uint256,uint256).selector
            ) {
                require e.msg.sender != strategy;
            }

        }
        preserved withdraw(address to, uint256[] ids) with (env e1) {
            require to != currentContract && to != strategy;
            require e1.msg.sender != strategy;
        }
        preserved forceWithdraw(address to, uint256[] ids) with (env e2) {
            require to != currentContract && to != strategy;
            require e2.msg.sender != strategy;
        }
        preserved partialWithdraw(address to, uint256[] ids, uint256[] amounts) with (env e3) {
            require to != currentContract && to != strategy;
            require e3.msg.sender != strategy;
        }
        preserved unsponsor(address to, uint256[] ids) with (env e4) {
            require to != currentContract && to != strategy;
            require e4.msg.sender != strategy;
        }
        preserved partialUnsponsor(address to, uint256[] ids, uint256[] amounts) with (env e5) {
            require to != currentContract && to != strategy;
            require e5.msg.sender != strategy;
        }
    }


/*
    @Invariant

    @Description:
        accumulatedPerfFee should remain 0 if the strategy never makes profit
*/
invariant zero_accumulatedPerfFee_if_not_making_profit()
    accumulatedPerfFee() == 0
    {
        preserved {
            require totalUnderlyingMinusSponsored() <= totalPrincipal();
        }
    }


/*
    @Invariant

    @Description:
        if the strategy never makes profit, any user's claimable yield, claimable shares and perfFee should be 0
*/
invariant zero_yield_if_not_making_profit(address user)
    claimableYield(user) == 0 && claimableShares(user) == 0 && perfFee(user) == 0
    {
        preserved {
            require totalUnderlyingMinusSponsored() <= totalPrincipal();
        }
    }


/*
    @Invariant

    @Description:
        deposit data should be either all 0 or none of the fields is 0
*/
invariant integrity_of_deposit_data(uint256 depositId)
    depositAmount(depositId) == 0 && 
    depositOwner(depositId) == 0 && 
    depositClaimer(depositId) == 0 && 
    depositLockedUntil(depositId) == 0
    ||
    depositAmount(depositId) != 0 && 
    depositOwner(depositId) != 0 && 
    depositClaimer(depositId) != 0 && 
    depositLockedUntil(depositId) != 0
    {
        preserved {
            require minLockPeriod() > 0;
        }
    }


/*
    @Rule

    @Category: variable transition

    @Description:
        deposit function should update state variables correctly and consistently
*/
rule integrity_of_deposit() {
    address inputToken; 
    uint64 lockDuration;
    uint256 amount; 
    uint16[] pcts;
    address[] claimers;
    bytes[] datas;
    uint256 slippage;
    env e;

    uint256 _userBalance = underlying.balanceOf(e.msg.sender);
    uint256 _vaultBalance = underlying.balanceOf(currentContract);
    uint256 _totalShares = totalShares();
    uint256 _totalPrincipal = totalPrincipal();
    uint256 _totalSharesOfClaimers = totalSharesOf(claimers);
    uint256 _totalPrincipalOfClaimers = totalPrincipalOf(claimers);

    deposit(e, inputToken, lockDuration, amount, pcts, claimers, datas, slippage);

    uint256 userBalance_ = underlying.balanceOf(e.msg.sender);
    uint256 vaultBalance_ = underlying.balanceOf(currentContract);
    uint256 totalShares_ = totalShares();
    uint256 totalPrincipal_ = totalPrincipal();
    uint256 totalSharesOfClaimers_ = totalSharesOf(claimers);
    uint256 totalPrincipalOfClaimers_ = totalPrincipalOf(claimers);

    assert _userBalance - userBalance_ == amount;
    assert vaultBalance_ - _vaultBalance == amount;
    assert totalPrincipal_ - _totalPrincipal == amount;
    assert totalPrincipalOfClaimers_ - _totalPrincipalOfClaimers == amount;
    assert totalShares_ - _totalShares == totalSharesOfClaimers_ - _totalPrincipalOfClaimers;
}


/*
    @Rule

    @Category: variable transition

    @Description:
        deposit and depositForGroupId should have the same effect on balances, shares and principal
*/
rule equivalence_of_deposit_and_depositForGroupId() {
    address inputToken; 
    uint64 lockDuration;
    uint256 amount; 
    uint16[] pcts;
    require pcts.length == 3;
    address[] claimers;
    require claimers.length == 3;
    bytes[] datas;
    require datas.length == 3;
    uint256 slippage;
    env e1;

    storage init = lastStorage;
    deposit(e1, inputToken, lockDuration, amount, pcts, claimers, datas, slippage);
    uint256 userBalance_deposit = underlying.balanceOf(e1.msg.sender);
    uint256 vaultBalance_deposit = underlying.balanceOf(currentContract);
    uint256 totalShares_deposit = totalShares();
    uint256 totalPrincipal_deposit = totalPrincipal();
    uint256 totalSharesOfClaimers_deposit = totalSharesOf(claimers);
    uint256 totalPrincipalOfClaimers_deposit = totalPrincipalOf(claimers);

    uint256 groupId;
    env e2;
    require e2.msg.sender == e1.msg.sender;
    depositForGroupId(e2, groupId, inputToken, lockDuration, amount, pcts, claimers, datas, slippage) at init;
    uint256 userBalance_depositForGroupId = underlying.balanceOf(e2.msg.sender);
    uint256 vaultBalance_depositForGroupId = underlying.balanceOf(currentContract);
    uint256 totalShares_depositForGroupId = totalShares();
    uint256 totalPrincipal_depositForGroupId = totalPrincipal();
    uint256 totalSharesOfClaimers_depositForGroupId = totalSharesOf(claimers);
    uint256 totalPrincipalOfClaimers_depositForGroupId = totalPrincipalOf(claimers);

    assert userBalance_deposit == userBalance_depositForGroupId;
    assert vaultBalance_deposit == vaultBalance_depositForGroupId;
    assert totalShares_deposit == totalShares_depositForGroupId;
    assert totalPrincipal_deposit == totalPrincipal_depositForGroupId;
    assert totalSharesOfClaimers_deposit == totalSharesOfClaimers_depositForGroupId;
    assert totalPrincipalOfClaimers_deposit == totalPrincipalOfClaimers_depositForGroupId;
}


/*
    @Rule

    @Category: variable transition

    @Description:
        withdraw function should update state variables correctly and consistently

    TODO - investigate violations in
        https://prover.certora.com/output/52311/335dffc5b058a738dc8e?anonymousKey=04fe57f2482e3aeba044101a2b5efb049deecf16
*/
rule integrity_of_withdraw() {
    address to;
    require to != currentContract && to != strategy;
    requireInvariant individual_shares_principal_le_total(to);

    uint256[] depositIds;
    require depositIds.length == 3;
    require depositIds[0] != depositIds[1] && depositIds[0] != depositIds[2] && depositIds[1] != depositIds[2];

    uint256 _userBalance = underlying.balanceOf(to);
    uint256 _totalUnderlying = totalUnderlying();
    uint256 _totalShares = totalShares();
    uint256 _totalPrincipal = totalPrincipal();
    uint256 _totalDeposits = totalDeposits(depositIds);

    env e;
    require e.block.coinbase != 0;
    underlying.setFee(e, 0);
    forceWithdraw(e, to, depositIds);

    uint256 userBalance_ = underlying.balanceOf(to);
    uint256 totalUnderlying_ = totalUnderlying();
    uint256 totalShares_ = totalShares();
    uint256 totalPrincipal_ = totalPrincipal();
    uint256 totalDeposits_ = totalDeposits(depositIds);

    assert userBalance_ - _userBalance == _totalDeposits;
    assert _totalUnderlying - totalUnderlying_ == _totalDeposits;
    assert _totalPrincipal - _totalPrincipal == _totalDeposits;
    assert _totalShares >= totalShares_;
    assert totalDeposits_ == 0;
}


/*
    @Rule

    @Category: variable transition

    @Description:
        forceWithdraw function should update state variables correctly and consistently
*/
rule integrity_of_forceWithdraw() {
    address to;
    require to != currentContract && to != strategy;
    requireInvariant individual_shares_principal_le_total(to);

    uint256[] depositIds;
    require depositIds.length == 3;
    require depositIds[0] != depositIds[1] && depositIds[0] != depositIds[2] && depositIds[1] != depositIds[2];

    uint256 _userBalance = underlying.balanceOf(to);
    uint256 _totalUnderlying = totalUnderlying();
    uint256 _totalShares = totalShares();
    uint256 _totalPrincipal = totalPrincipal();
    uint256 _totalDeposits = totalDeposits(depositIds);

    env e;
    require e.block.coinbase != 0;
    underlying.setFee(e, 0);
    forceWithdraw(e, to, depositIds);

    uint256 userBalance_ = underlying.balanceOf(to);
    uint256 totalUnderlying_ = totalUnderlying();
    uint256 totalShares_ = totalShares();
    uint256 totalPrincipal_ = totalPrincipal();
    uint256 totalDeposits_ = totalDeposits(depositIds);

    assert userBalance_ >= _userBalance;
    assert _totalUnderlying >= totalUnderlying_;
    assert _totalPrincipal >= _totalPrincipal;
    assert _totalShares >= totalShares_;
    assert totalDeposits_ == 0;
}



/*
    @Rule

    @Category: variable transition

    @Description:
        partialWithdraw function should update state variables correctly and consistently

    TODO - investigate violations in
        https://prover.certora.com/output/52311/a9a2f580a40d1fe0dc2d?anonymousKey=db3a2d8adf633c8c8678017d189c21acb6df7b32
        It looks due to arithmetic rounding
*/
rule integrity_of_partialWithdraw() {
    address to;
    require to != currentContract && to != strategy;

    uint256[] depositIds;
    uint256[] amounts;
    require depositIds.length == 3 && amounts.length == 3;
    require depositIds[0] != depositIds[1] && depositIds[0] != depositIds[2] && depositIds[1] != depositIds[2];

    uint256 i;
    require i >= 0 && i < depositIds.length;

    uint256 _userBalance = underlying.balanceOf(to);
    uint256 _totalUnderlying = totalUnderlying();
    uint256 _totalShares = totalShares();
    uint256 _totalPrincipal = totalPrincipal();
    uint256 _totalDeposits = totalDeposits(depositIds);
    uint256 _totalSharesOfClaimers = totalSharesOf(depositIds);
    uint256 _totalPrincipalOfClaimers = totalPrincipalOf(depositIds);
    uint256 _amount = depositAmount(depositIds[i]);

    env e;
    require e.block.coinbase != 0;
    underlying.setFee(e, 0);
    partialWithdraw(e, to, depositIds, amounts);

    uint256 userBalance_ = underlying.balanceOf(to);
    uint256 totalUnderlying_ = totalUnderlying();
    uint256 totalShares_ = totalShares();
    uint256 totalPrincipal_ = totalPrincipal();
    uint256 totalDeposits_ = totalDeposits(depositIds);
    uint256 totalSharesOfClaimers_ = totalSharesOf(depositIds);
    uint256 totalPrincipalOfClaimers_ = totalPrincipalOf(depositIds);
    uint256 amount_ = depositAmount(depositIds[i]);

    uint256 totalAmount = totalAmount(amounts);
    assert userBalance_ - _userBalance == totalAmount;
    assert _totalDeposits - totalDeposits_ == totalAmount;
    assert _totalUnderlying - totalUnderlying_ == totalAmount;
    assert _totalPrincipal - totalPrincipal_ == totalAmount;
    assert _totalShares - totalShares_ == _totalSharesOfClaimers - totalSharesOfClaimers_;
    assert _totalPrincipalOfClaimers == _totalDeposits;
    assert totalPrincipalOfClaimers_ == totalDeposits_;
    assert _amount - amount_ == amounts[i];
}


/*
    @Rule

    @Category: variable transition

    @Description:
        sponsor function should update state variables correctly and consistently
*/
rule integrity_of_sponsor() {
    address inputToken;
    require inputToken == underlying;

    uint256 amount;
    uint256 lockDuration;
    uint256 slippage;
    
    env e;
    underlying.setFee(e, 0);

    uint256 _userBalance = underlying.balanceOf(e.msg.sender);
    uint256 _vaultBalance = underlying.balanceOf(currentContract);
    uint256 _totalSponsored = totalSponsored();
    uint256 _totalShares = totalShares();
    uint256 _totalPrincipal = totalPrincipal();

    sponsor(e, inputToken, amount, lockDuration, slippage);

    uint256 userBalance_ = underlying.balanceOf(e.msg.sender);
    uint256 vaultBalance_ = underlying.balanceOf(currentContract);
    uint256 totalSponsored_ = totalSponsored();
    uint256 totalShares_ = totalShares();
    uint256 totalPrincipal_ = totalPrincipal();

    assert _userBalance - userBalance_ == amount;
    assert vaultBalance_ - _vaultBalance == amount;
    assert totalSponsored_ - _totalSponsored == amount;
    assert _totalShares == totalShares_;
    assert _totalPrincipal == totalPrincipal_;
}


/*
    @Rule

    @Category: variable transition

    @Description:
        unsponsor function should update state variables correctly and consistently
*/
rule integrity_of_unsponsor() {
    address to;
    require to != currentContract && to != strategy;

    uint256[] depositIds;
    require depositIds.length == 3;
    require depositIds[0] != depositIds[1] && depositIds[0] != depositIds[2] && depositIds[1] != depositIds[2];

    uint256 _userBalance = underlying.balanceOf(to);
    uint256 _totalUnderlying = totalUnderlying();
    uint256 _totalSponsored = totalSponsored();
    uint256 _totalDeposits = totalDeposits(depositIds);
    uint256 _totalShares = totalShares();
    uint256 _totalPrincipal = totalPrincipal();

    env e;
    underlying.setFee(e, 0);
    unsponsor(e, to, depositIds);
    
    uint256 userBalance_ = underlying.balanceOf(to);
    uint256 totalUnderlying_ = totalUnderlying();
    uint256 totalSponsored_ = totalSponsored();
    uint256 totalDeposits_ = totalDeposits(depositIds);
    uint256 totalShares_ = totalShares();
    uint256 totalPrincipal_ = totalPrincipal();

    assert userBalance_ - _userBalance == _totalDeposits;
    assert _totalUnderlying - totalUnderlying_ == _totalDeposits;
    assert _totalSponsored - totalSponsored_ == _totalDeposits;
    assert _totalShares == totalShares_;
    assert _totalPrincipal == totalPrincipal_;
    assert totalDeposits_ == 0;    
}


/*
    @Rule

    @Category: variable transition

    @Description:
        partialUnsponsor function should update state variables correctly and consistently
*/
rule integrity_of_partialUnsponsor() {
    address to;
    require to != currentContract && to != strategy;

    uint256[] depositIds;
    uint256[] amounts;
    require depositIds.length == 3 && amounts.length == 3;
    require depositIds[0] != depositIds[1] && depositIds[0] != depositIds[2] && depositIds[1] != depositIds[2];

    uint256 i;
    require i >= 0 && i < depositIds.length;

    uint256 _userBalance = underlying.balanceOf(to);
    uint256 _totalUnderlying = totalUnderlying();
    uint256 _totalSponsored = totalSponsored();
    uint256 _deposit = depositAmount(depositIds[i]);
    uint256 _totalShares = totalShares();
    uint256 _totalPrincipal = totalPrincipal();

    env e;
    underlying.setFee(e, 0);
    partialUnsponsor(e, to, depositIds, amounts);
    
    uint256 userBalance_ = underlying.balanceOf(to);
    uint256 totalUnderlying_ = totalUnderlying();
    uint256 totalSponsored_ = totalSponsored();
    uint256 deposit_ = depositAmount(depositIds[i]);
    uint256 totalShares_ = totalShares();
    uint256 totalPrincipal_ = totalPrincipal();

    uint256 s = totalAmount(amounts);
    assert userBalance_ - _userBalance == s;
    assert _totalUnderlying - totalUnderlying_ == s;
    assert _totalSponsored - totalSponsored_ == s;
    assert _deposit - deposit_ == amounts[i];
    assert _totalShares == totalShares_;
    assert _totalPrincipal == totalPrincipal_;
}


/*
    @Rule

    @Category: variable transition

    @Description:
        admin and settings functions should update state variables correctly and consistently
*/
rule integrity_of_admin_settings_functions() {
    env e;
    address newAdmin;
    require e.msg.sender != newAdmin;
    require hasRole(DEFAULT_ADMIN_ROLE(), e.msg.sender);
    transferAdminRights(e, newAdmin);
    assert !hasRole(DEFAULT_ADMIN_ROLE(), e.msg.sender);
    assert hasRole(DEFAULT_ADMIN_ROLE(), newAdmin);

    address token;
    address pool;
    int128 tokenI;
    int128 underlyingI;
    env e1;
    require token != pool;
    addPool(e1, token, pool, tokenI, underlyingI);
    assert getCurvePool(token) == pool;

    env e2;
    removePool(e2, token);
    assert getCurvePool(token) == 0;

    env e3;
    uint16 investPct;
    setInvestPct(e3, investPct);
    assert investPct() == investPct;

    env e4;
    address treasury;
    setTreasury(e4, treasury);
    assert treasury() == treasury;

    env e5;
    uint16 perfFeePct;
    setPerfFeePct(e5, perfFeePct);
    assert perfFeePct() == perfFeePct;

    env e6;
    address s;
    setStrategy(e6, s);
    assert strategy() == s;

    env e7;
    uint16 lossTolerancePct;
    setLossTolerancePct(e7, lossTolerancePct);
    assert lossTolerancePct() == lossTolerancePct;
}


/*
    @Rule

    @Category: state transition

    @Description:
        pause and exitPause functions should update states correctly and consistently
*/
rule integrity_of_pause_exitPause() {
    require !paused();
    env e;
    pause(e);
    assert paused();

    env e1;
    unpause(e1);
    assert !paused();

    require !exitPaused();
    env e2;
    exitPause(e2);
    assert exitPaused();

    env e3;
    exitUnpause(e3);
    assert !exitPaused();
}


/*
    @Rule

    @Category: variable transition

    @Description:
        withdrawPerformanceFee function should update state variables correctly and consistently
*/
rule integrity_of_withdrawPerformanceFee() {
    env e;
    require treasury() != currentContract;
    require treasury() != strategy();

    underlying.setFee(e, 0);

    uint256 _balanceOfTreasury = underlying.balanceOf(treasury());
    uint256 _totalUnderlying = totalUnderlying();
    uint256 _accumulatedPerformanceFee = accumulatedPerfFee();

    withdrawPerformanceFee(e);

    uint256 balanceOfTreasury_ = underlying.balanceOf(treasury());
    uint256 totalUnderlying_ = totalUnderlying();
    uint256 accumulatedPerformanceFee_ = accumulatedPerfFee();

    assert balanceOfTreasury_ - _balanceOfTreasury == _accumulatedPerformanceFee;
    assert _totalUnderlying - totalUnderlying_ == _accumulatedPerformanceFee;
    assert accumulatedPerformanceFee_ == 0;
}


/*
    @Rule

    @Category: unit test

    @Description:
        updateInvested function should make maxInvestableAmount equal alreadyInvested
*/
rule interity_of_updateInvested() {
    env e;
    require strategy() != currentContract;

    underlying.setFee(e, 0);
    uint256 _maxInvestableAmount = maxInvestableAmount();
    uint256 _alreadyInvested = alreadyInvested();
    require 
        _maxInvestableAmount - _alreadyInvested > rebalanceMinimum() 
        || 
        _alreadyInvested - _maxInvestableAmount > rebalanceMinimum();

    updateInvested(e);

    uint256 maxInvestableAmount_ = maxInvestableAmount();
    uint256 alreadyInvested_ = alreadyInvested();
    assert maxInvestableAmount_ == alreadyInvested_;
}


/*
    @Rule

    @Category: unit test

    @Description:
        when the vault is in a loss, withdraw should revert
*/
rule withdraw_reverts_when_in_loss() {
    require totalUnderlyingMinusSponsored() < totalPrincipal();
    env e;
    address to;
    uint256[] ids;
    withdraw@withrevert(e, to, ids); // should always revert
    assert lastReverted;
}

/*
    @Rule

    @Category: unit test

    @Description:
        withdraw succeeds only if the vault is not in a loss
*/
rule withdraw_succeeds_only_if_not_in_loss() {
    env e;
    address to;
    uint256[] ids;
    withdraw@withrevert(e, to, ids);
    assert !lastReverted => totalUnderlyingMinusSponsored() >= totalPrincipal();
}


/*
    @Rule

    @Category: unit test

    @Description:
        if a vault is paused, then deposit and sponsor functions will revert
*/
rule paused_vault_rejects_any_deposits() {
    env e;
    method f;
    calldataarg args;
    require 
        f.selector == deposit(address, uint64, uint256, uint16[], address[], bytes[], uint256).selector
        ||
        f.selector == deposit((address,uint64,uint256,(uint16,address,bytes)[],string,uint256)).selector
        ||
        f.selector == depositForGroupId(uint256, address, uint64, uint256, uint16[], address[], bytes[], uint256).selector
        ||
        f.selector == depositForGroupId(uint256, (address,uint64,uint256,(uint16,address,bytes)[],string,uint256)).selector
        ||
        f.selector == sponsor(address, uint256, uint256, uint256).selector;
    require paused();

    f@withrevert(e, args);

    assert lastReverted;
}


/*
    @Rule

    @Category: unit test

    @Description:
        if a vault is exitPaused, then withdraw, unsponsor and claimYield functions will revert
*/
rule exitPaused_vault_rejects_any_withdrawals() {
    env e;
    method f;
    calldataarg args;
    require 
        f.selector == withdraw(address, uint256[]).selector
        ||
        f.selector == forceWithdraw(address, uint256[]).selector
        ||
        f.selector == partialWithdraw(address, uint256[], uint256[]).selector
        ||
        f.selector == unsponsor(address, uint256[]).selector
        ||
        f.selector == partialUnsponsor(address, uint256[], uint256[]).selector
        ||
        f.selector == claimYield(address).selector;

    require exitPaused();

    f@withrevert(e, args);

    assert lastReverted;
}


/*
    @Rule

    @Category: unit test

    @Description:
        deposit function should revert on any invalid deposit params
*/
rule deposit_reverts_on_invalid_params() {
    env e;
    address inputToken; 
    uint64 lockDuration; 
    uint256 amount;
    uint16[] pcts;
    address[] beneficiaries;
    bytes[] datas;
    uint256 slippage;
    
    require
        inputToken != getUnderlying() && getCurvePool(inputToken) == 0
        ||
        lockDuration < minLockPeriod()
        || 
        lockDuration > MAX_DEPOSIT_LOCK_DURATION()
        ||
        amount == 0
        ||
        anyZero(pcts)
        ||
        anyZero(beneficiaries)
        || 
        !isTotal100Pct(pcts);

    deposit@withrevert(e, inputToken, lockDuration, amount, pcts, beneficiaries, datas, slippage);

    assert lastReverted;
}


rule sponsor_reverts_on_invalid_params() {
    env e;
    address inputToken;
    uint256 amount;
    uint256 lockDuration;
    uint256 slippage;

    require
        inputToken != getUnderlying() && getCurvePool(inputToken) == 0
        ||
        lockDuration < MIN_SPONSOR_LOCK_DURATION()
        || 
        lockDuration > MAX_SPONSOR_LOCK_DURATION()
        ||
        amount == 0;
    
    sponsor@withrevert(e, inputToken, amount, lockDuration, slippage);

    assert lastReverted;
}


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


/*
    @Rule

    @Category: unit test

    @Description:
        the totalUnderlyingMinusSponsored() value should equal totalUnderlying() minus totalSponsored and accumulatedPerfFee  
*/
rule totalUnderlyingMinusSponsored_correct() {
    require totalSponsored() + accumulatedPerfFee() <= totalUnderlying();
    assert totalUnderlyingMinusSponsored() == totalUnderlying() - totalSponsored() - accumulatedPerfFee();
}