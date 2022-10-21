using MockStrategySync as strategy
using MockERC20 as underlying

methods {
	underlying.balanceOf(address account) returns (uint256) envfree;
    totalUnderlying() returns (uint256) envfree;
    totalShares() returns (uint256) envfree;
    totalPrincipal() returns (uint256) envfree;
}

rule withdraw_succeeds {

    uint64 amount;
    env eV;
    calldataarg arg;

    require amount != 0;

    setAmountFromCertora(eV, amount); // This is a communication link between Certora and Vault
    underlying.mint(eV, eV.msg.sender, amount);
    underlying.approve(eV, currentContract, amount); //address(vault)
    deposit(eV, arg); // Generic call because Certora does not support arrays inside structures explicitly

    mathint balance_this_before = underlying.balanceOf(currentContract);
    mathint totalshares_vault_before = totalShares();
    mathint totalprincipal_vault_before = totalPrincipal();
    mathint balance_vault_before = totalUnderlying();

    withdraw(eV, arg);

    uint256 balance_this_after = underlying.balanceOf(currentContract);
    uint256 totalunderlying_vault_after = totalUnderlying();

    assert totalUnderlying() == balance_vault_before - amount, "Vault's balance is decreased by amount";
    assert balance_this_after == balance_this_before + amount, "(this)'s balance is increased by amount";
    assert totalShares() == totalshares_vault_before - (amount * (10 ^ 18)), "Total shares decreases by a proportion of amount";
    assert totalPrincipal() == totalprincipal_vault_before - amount, "Total principal is decreased by amount";

}
