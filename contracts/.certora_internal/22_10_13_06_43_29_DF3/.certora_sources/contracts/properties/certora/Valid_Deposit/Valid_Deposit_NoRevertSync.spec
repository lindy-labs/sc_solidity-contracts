using MockStrategySync as strategy
using MockERC20 as underlying
using Vault as vault

methods {
	underlying.balanceOf(address account) returns (uint256) envfree;
    vault.totalUnderlying() returns (uint256) envfree;
    vault.totalShares() returns (uint256) envfree;
    vault.totalPrincipal() returns (uint256) envfree;
}

rule deposit_succeeds {

    address inputToken;
    uint64 lockDuration;
    uint64 amount;
    string name;
    uint256 slippage;

    env eV;

    require amount > 0;

    assert false, "Just testing for false (zero)";

    assert true, "Just testing for true (zero)";

    mint_helper(eV, currentContract, amount);

    uint256 balance_this_before = underlying.balanceOf(currentContract);
    uint256 balance_vault_before = vault.totalUnderlying();
    uint256 totalshares_vault_before = vault.totalShares();
    uint256 totalprincipal_vault_before = vault.totalPrincipal();

    assert false, "Just testing for false (before)";

    assert true, "Just testing for true (before)";

    depositParts(eV, inputToken, lockDuration, amount, name, slippage);

    uint256 balance_this_after = underlying.balanceOf(currentContract);
    uint256 balance_vault_after = vault.totalUnderlying();

    assert false, "Just testing for false (after)";

    assert true, "Just testing for true (after)";

    /*assert balance_vault_after == balance_vault_before - amount, "Vault's balance is increased by amount";
    assert balance_this_after == balance_this_before - amount, "(this)'s balance is decreased by amount";
    assert vault.totalShares() == totalshares_vault_before /*+ (amount * (10 ^ 18))/, "Total shares is increased by amount * (10 ^ 18)";
    assert vault.totalPrincipal() == totalprincipal_vault_before + amount, "Total principal is increased by amount";*/

}
