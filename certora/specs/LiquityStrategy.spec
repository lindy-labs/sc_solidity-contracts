import "erc20.spec"

using MockLUSD as underlying
using MockStabilityPool as stabilityPool
using Vault as vault
using MockLQTY as lqty

methods {
    // initializer
    initialize(address, address, address, address, address, address, uint16, address)

    // admin/settings/keeper/manager functions
    setMinPrincipalProtectionPct(uint16)
    transferAdminRights(address)
    invest()
    withdrawToVault(uint256) returns (uint256)
    allowSwapTarget(address)
    denySwapTarget(address)
    reinvest(address, uint256, bytes, uint256, bytes, uint256)
    transferYield(address, uint256)

    // unprivileged functions
    harvest()

    // view functions
    investedAssets() returns (uint256) envfree
    hasAssets() returns (bool) envfree
    isSync() returns (bool) envfree
    hasRole(bytes32, address) returns (bool) envfree
    getEthBalance() returns (uint256) envfree

    // public variables
    vault() returns (address) envfree
    stabilityPool() returns (address) envfree
    curveExchange() returns (address) envfree
    lqty() returns (address) envfree
    allowedSwapTargets(address) returns (bool) envfree
    minPrincipalProtectionPct() returns (uint16) envfree
    MANAGER_ROLE() returns (bytes32) envfree
    KEEPER_ROLE() returns (bytes32) envfree
    SETTINGS_ROLE() returns (bytes32) envfree
    DEFAULT_ADMIN_ROLE() returns (bytes32) envfree

    // erc20
    underlying.balanceOf(address) returns (uint256) envfree
    lqty.balanceOf(address) returns (uint256) envfree

    // stability pool
    stabilityPool.getCompoundedLUSDDeposit(address) returns (uint256) envfree
}

definition adminFunctions(method f) returns bool =
    f.selector == transferAdminRights(address).selector;

definition settingsFunctions(method f) returns bool =
    f.selector == setMinPrincipalProtectionPct(uint16).selector
    ||
    f.selector == allowSwapTarget(address).selector
    ||
    f.selector == denySwapTarget(address).selector;

definition keeperFunctions(method f) returns bool =
    f.selector == reinvest(address, uint256, bytes, uint256, bytes, uint256).selector;

definition managerFunctions(method f) returns bool =
    f.selector == invest().selector
    ||
    f.selector == withdrawToVault(uint256).selector
    ||
    f.selector == transferYield(address, uint256).selector;


/*
    @Rule

    @Category: high level

    @Description:
        privileged functions should revert is the caller has no privilege
*/
rule privileged_functions_revert_if_no_priviledge(method f) 
filtered{f->adminFunctions(f) || settingsFunctions(f) || keeperFunctions(f) || managerFunctions(f)} 
{
    env e;
    require adminFunctions(f) && !hasRole(DEFAULT_ADMIN_ROLE(), e.msg.sender)
            ||
            settingsFunctions(f) && !hasRole(SETTINGS_ROLE(), e.msg.sender)
            ||
            keeperFunctions(f) && !hasRole(KEEPER_ROLE(), e.msg.sender)
            ||
            managerFunctions(f) && !hasRole(MANAGER_ROLE(), e.msg.sender);
    calldataarg args;

    f@withrevert(e, args);

    assert lastReverted;
}

/*
    @Rule

    @Category: unit test

    @Description:
        invest function moves all the LUSD balance from strategy to the stability pool
*/
rule initialize_once_only() {
    address _vault;
    address _admin;
    address _stabilityPool;
    address _lqty;
    address _underlying;
    address _keeper;
    uint16 _principalProtectionPct;
    address _curveExchange;
    env e;
    initialize(e, _vault, _admin, _stabilityPool, _lqty, _underlying, _keeper, _principalProtectionPct, _curveExchange);

    initialize@withrevert(e, _vault, _admin, _stabilityPool, _lqty, _underlying, _keeper, _principalProtectionPct, _curveExchange);

    assert lastReverted;
}


/*
    @Rule

    @Category: variable transition

    @Description:
        invest function moves all the LUSD balance from strategy to the stability pool
*/
rule integrity_of_invest() {
    require stabilityPool != currentContract;

    mathint _balanceOfStrategy = underlying.balanceOf(currentContract);
    mathint _balanceOfPool = underlying.balanceOf(stabilityPool);

    env e;
    invest(e);

    assert underlying.balanceOf(currentContract) == 0;
    assert underlying.balanceOf(stabilityPool) - _balanceOfPool == _balanceOfStrategy;
}


/*
    @Rule

    @Category: variable transition

    @Description:
        reinvest function converts LQTY and ETH rewards to LUSD and 
        moves all the LUSD balance from strategy to the stability pool
*/
rule integrity_of_reinvest() {
    require stabilityPool != currentContract;

    mathint _balanceOfStrategy = underlying.balanceOf(currentContract);
    mathint _balanceOfPool = underlying.balanceOf(stabilityPool);

    env e;
    calldataarg args;
    reinvest(e, args);

    assert underlying.balanceOf(currentContract) == 0;
    assert underlying.balanceOf(stabilityPool) - _balanceOfPool >= _balanceOfStrategy;
}


/*
    @Rule

    @Category: variable transition

    @Description:
        `withdrawToVault(uint256 amount)` should withdraw LUSD to the Vault
*/
rule integrity_of_withdrawToVault() {
    require stabilityPool != currentContract && vault != currentContract && vault != stabilityPool;
    require underlying.balanceOf(currentContract) == 0;

    mathint _balanceOfPool = underlying.balanceOf(stabilityPool);
    mathint _balanceOfVault = underlying.balanceOf(vault);
    require stabilityPool.getCompoundedLUSDDeposit(currentContract) == _balanceOfPool;

    env e;
    uint256 amount;
    mathint amountWithdrawn = withdrawToVault(e, amount);

    mathint balanceOfPool_ = underlying.balanceOf(stabilityPool);
    mathint balanceOfVault_ = underlying.balanceOf(vault);

    assert underlying.balanceOf(currentContract) == 0;
    assert _balanceOfPool - amountWithdrawn == balanceOfPool_;
    assert _balanceOfVault + amountWithdrawn == balanceOfVault_;
}


/*
    @Rule

    @Category: variable transition

    @Description:
        havest function should claim ETH and LQTY rewards only and not change LUSD balance of any account
*/
rule integrity_of_harvest() {
    require stabilityPool != currentContract && vault != currentContract && vault != stabilityPool;

    mathint _balanceOfPool = underlying.balanceOf(stabilityPool);
    mathint _balanceOfStrategy = underlying.balanceOf(currentContract);
    mathint _balanceOfVault = underlying.balanceOf(vault);
    mathint _lqtyBalance = lqty.balanceOf(currentContract);
    mathint _ethBalance = getEthBalance();

    env e;
    harvest(e);

    mathint balanceOfPool_ = underlying.balanceOf(stabilityPool);
    mathint balanceOfStrategy_ = underlying.balanceOf(currentContract);
    mathint balanceOfVault_ = underlying.balanceOf(vault);
    mathint lqtyBalance_ = lqty.balanceOf(currentContract);
    mathint ethBalance_ = getEthBalance();

    assert _balanceOfPool == balanceOfPool_;
    assert _balanceOfStrategy == balanceOfStrategy_;
    assert _balanceOfVault == balanceOfVault_;
    assert lqtyBalance_ >= _lqtyBalance;
    assert ethBalance_ >= _ethBalance;
}


/*
    @Rule

    @Category: unit test

    @Description:
        investedAssets is greater than or equal to the LUSD deposit in the stability pool
*/
rule investedAssets_ge_lusdInSP() {
    assert investedAssets() >= stabilityPool.getCompoundedLUSDDeposit(currentContract);
}


/*
    @Rule

    @Category: unit test

    @Description:
        hasAssets return value should be consistent with investedAssets return value
*/
rule integrity_of_hasAssets() {
    assert investedAssets() > 0 <=> hasAssets() && investedAssets() == 0 <=> !hasAssets();
}


/*
    @Rule

    @Category: unit test

    @Description:
        the strategy is sync
*/
rule strategy_is_sync() {
    assert isSync();
}


/*
    @Rule

    @Category: variable transition

    @Description:
        `allowSwapTarget(address _swapTarget)` should whitelist the `_swapTarget`
*/
rule integrity_of_allowSwapTarget() {
    env e;
    address _swapTarget;
    allowSwapTarget(e, _swapTarget);

    assert allowedSwapTargets(_swapTarget);
}


/*
    @Rule

    @Category: variable transition

    @Description:
        `denySwapTarget(address _swapTarget)` should remove the `_swapTarget` from the whitelist
*/
rule integrity_of_denySwapTarget() {
    env e;
    address _swapTarget;
    denySwapTarget(e, _swapTarget);

    assert !allowedSwapTargets(_swapTarget);
}


/*
    @Rule

    @Category: variable transition

    @Description:
        setMinPrincipalProtectionPct should set minPrincipalProtectionPct
*/
rule integrity_of_setMinPrincipalProtectionPct() {
    env e;
    uint16 pct;

    setMinPrincipalProtectionPct(e, pct);

    assert minPrincipalProtectionPct() == pct;
}


/*
    @Rule

    @Category: variable transition

    @Description:
        transferAdminRights should transfer admin roles from msg sender to the new admin
*/
rule integrity_of_transferAdminRights() {
    env e;
    address newAdmin;

    transferAdminRights(e, newAdmin);

    assert !hasRole(DEFAULT_ADMIN_ROLE(), e.msg.sender);
    assert hasRole(DEFAULT_ADMIN_ROLE(), newAdmin);
    assert !hasRole(KEEPER_ROLE(), e.msg.sender);
    assert hasRole(KEEPER_ROLE(), newAdmin);
    assert !hasRole(SETTINGS_ROLE(), e.msg.sender);
    assert hasRole(SETTINGS_ROLE(), newAdmin);
}