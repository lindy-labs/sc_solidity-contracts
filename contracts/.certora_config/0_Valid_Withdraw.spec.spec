using MockStrategySync as strategy
using MockERC20 as underlying
using Vault as vault

methods {
	underlying.balanceOf(address account) returns (uint256) envfree;
    vault.totalUnderlying() returns (uint256) envfree;
    vault.totalShares() returns (uint256) envfree;
    vault.totalPrincipal() returns (uint256) envfree;
}

rule withdraw_succeeds {

    address inputToken;
    uint64 lockDuration;
    uint64 amount;
    string name;
    uint256 slippage;

    env eV;

    require amount != 0;

    mint_helper(eV, currentContract, amount);
    depositParts(eV, inputToken, lockDuration, amount, name, slippage);

    mathint balance_this_before = underlying.balanceOf(currentContract);
    mathint totalshares_vault_before = vault.totalShares();
    mathint totalprincipal_vault_before = vault.totalPrincipal();
    mathint balance_vault_before = vault.totalUnderlying();

    withdrawUp(eV, currentContract, amount);

    uint256 balance_this_after = underlying.balanceOf(currentContract);
    uint256 totalunderlying_vault_after = vault.totalUnderlying();

    assert vault.totalUnderlying() == balance_vault_before - amount, "Vault's balance is decreased by amount";
    assert balance_this_after == balance_this_before + amount, "(this)'s balance is increased by amount";
    assert vault.totalShares() == totalshares_vault_before - (amount * (10 ^ 18)), "Total shares decreases by a proportion of amount";
    assert vault.totalPrincipal() == totalprincipal_vault_before - amount, "Total principal is decreased by amount";

}
