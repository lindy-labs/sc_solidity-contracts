import "erc20.spec"

using MockLUSD as underlying

methods {
    // initializer
    initialize(address, address, address, address, address, address, uint16, address)

    // admin/settings/keeper/manager functions
    setMinPrincipalProtectionPct(uint16)
    transferAdminRights(address)
    invest()
    withdrawToVault(uint256)
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

    // public variables
    vault() returns (address) envfree
    stabilityPool() returns (address) envfree
    curveExchange() returns (address) envfree
    lqty() returns (address) envfree
    allowedSwapTargets(address) returns (bool) envfree
    MANAGER_ROLE() returns (bytes32) envfree
    KEEPER_ROLE() returns (bytes32) envfree
    SETTINGS_ROLE() returns (bytes32) envfree
    DEFAULT_ADMIN_ROLE() returns (bytes32) envfree

    // erc20
    underlying.balanceOf(address) returns (uint256) envfree
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
