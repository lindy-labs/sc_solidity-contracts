import "erc20.spec"

using MockLUSD as underlying
using MockRyskLiquidityPool as ryskLqPool
using Vault as vault

methods {

    // admin/manager functions
    transferAdminRights(address)
    invest()
    completeWithdrawal()
    withdrawToVault(uint256)
    transferYield(address, uint256)

    // view functions
    investedAssets() returns (uint256) envfree
    hasAssets() returns (bool) envfree
    isSync() returns (bool) envfree
    hasRole(bytes32, address) returns (bool) envfree

    // public variables
    vault() returns (address) envfree
    ryskLqPool() returns (address) envfree
    MANAGER_ROLE() returns (bytes32) envfree
    KEEPER_ROLE() returns (bytes32) envfree
    SETTINGS_ROLE() returns (bytes32) envfree
    DEFAULT_ADMIN_ROLE() returns (bytes32) envfree

    // erc20
    underlying.balanceOf(address) returns (uint256) envfree
}

definition adminFunctions(method f) returns bool =
    f.selector == transferAdminRights(address).selector;

definition managerFunctions(method f) returns bool =
    f.selector == invest().selector
    ||
    f.selector == withdrawToVault(uint256).selector
    ||
    f.selector == transferYield(address, uint256).selector; // There is an issue here


/*
    @Rule

    @Category: High level

    @Description:
        privileged functions should revert if the `msg.sender` does not have the privilege
*/
rule privileged_functions_revert_if_no_priviledge(method f) 
filtered{f->adminFunctions(f) || managerFunctions(f)} 
{
    env e;
    require adminFunctions(f) && !hasRole(DEFAULT_ADMIN_ROLE(), e.msg.sender)
            ||
            managerFunctions(f) && !hasRole(MANAGER_ROLE(), e.msg.sender);
    calldataarg args;

    f@withrevert(e, args);

    assert lastReverted;
}

/*
    @Rule

    @Category: Variable transition

    @Description:
        invest function moves all the LUSD balance from strategy to the rysk stability pool
*/
rule integrity_of_invest() {
    require ryskLqPool != currentContract;
    mathint _balanceOfStrategy = underlying.balanceOf(currentContract);
    mathint _balanceOfPool = underlying.balanceOf(ryskLqPool);
    env e;
    invest(e);
    assert underlying.balanceOf(currentContract) == 0;
    assert underlying.balanceOf(ryskLqPool) - _balanceOfStrategy == _balanceOfPool;
}

/*
    @Rule

    @Category: Variable transition

    @Description:
        Initiate a withdraw to the Rysk Liquidity Pool of the amount of shares needed
*/
rule integrity_of_withdrawToVault() {
    env e;
    require ryskLqPool != currentContract && vault != currentContract && vault != ryskLqPool && vault != e.msg.sender && ryskLqPool != e.msg.sender && currentContract != e.msg.sender;

    mathint _balanceOfRyskLqPool = underlying.balanceOf(ryskLqPool);
    mathint _balanceOfSender = underlying.balanceOf(e.msg.sender);
    mathint _balanceOfStrategy = underlying.balanceOf(currentContract);

    uint256 amount;
    withdrawToVault(e, amount); // Initiate a withdraw

    mathint balanceOfStrategy_ = underlying.balanceOf(currentContract);
    mathint balanceOfRyskLqPool_ = underlying.balanceOf(ryskLqPool);
    mathint balanceOfSender_ = underlying.balanceOf(e.msg.sender);

    assert _balanceOfStrategy == balanceOfStrategy_;
    assert balanceOfSender_ - _balanceOfSender == _balanceOfRyskLqPool - balanceOfRyskLqPool_; // Transferring shares from sender to rysk pool

}

/*
    @Rule

    @Category: Variable transition

    @Description:
        Complete a withdraw initiated in a previous epoch
*/
rule integrity_of_completeWithdrawal() {
    env e;
    require vault != currentContract && vault != ryskLqPool && currentContract != ryskLqPool;

    mathint _balanceOfVault = underlying.balanceOf(vault);
    mathint _balanceOfRyskLqPool = underlying.balanceOf(ryskLqPool);
    mathint _balanceOfStrategy = underlying.balanceOf(currentContract);

    completeWithdrawal(e); // Complete a withdraw

    mathint balanceOfVault_ = underlying.balanceOf(vault);
    mathint balanceOfRyskLqPool_ = underlying.balanceOf(ryskLqPool);
    mathint balanceOfStrategy_ = underlying.balanceOf(currentContract);

    assert _balanceOfStrategy == balanceOfStrategy_;
    assert _balanceOfRyskLqPool >= balanceOfRyskLqPool_; // Remove the shares from the Rysk Pool
    assert balanceOfVault_ >= _balanceOfVault; // Transfer the equivalent amount (from shares) from Rysk Pool to Vault

}
/*
    @Rule

    @Category: unit test

    @Description:
        isSync() should return false
*/
rule integrity_of_isSync() {

    assert !isSync();

}

/*
    @Rule

    @Category: Unit test

    @Description:
        hasAssets return value should be consistent with investedAssets return value
*/
rule integrity_of_hasAssets() {
    assert investedAssets() > 0 <=> hasAssets() && investedAssets() == 0 <=> !hasAssets();
}

/*
    @Rule

    @Category: Variable transition

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

/*
    @Rule

    @Category: Unit test

    @Description:
        when the amount is zero, withdrawToVault should revert
*/
rule withdrawToVault_reverts_when_amount_is_zero() {
    uint256 amount;
    require amount == 0;
    env e;
    withdrawToVault@withrevert(e, amount); // should always revert
    assert lastReverted;
}

/*
    @Rule

    @Category: Unit test

    @Description:
        when the balance of the current contract is zero, invest should revert
*/
rule invest_reverts_when_balance_of_the_current_contract_is_zero() {
    require underlying.balanceOf(currentContract) == 0;
    env e;
    invest@withrevert(e); // should always revert
    assert lastReverted;
}
