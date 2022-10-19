using MockStrategySync as strategy
using MockERC20 as underlying
using Vault as vault

methods {
	underlying.balanceOf(address account) returns (uint256) envfree;
    vault.totalUnderlying() returns (uint256) envfree;
    vault.totalShares() returns (uint256) envfree;
    vault.totalPrincipal() returns (uint256) envfree;
    vault.totalSponsored() returns (uint256) envfree;
}

rule sponsor_succeeds {

    uint64 lockDuration;
    uint64 amount;

    env eV;

    underlying.mint(eV, currentContract, amount);

    uint256 balance_this_before = underlying.balanceOf(currentContract);
    uint256 balance_vault_before = vault.totalSponsored();
    uint256 totalshares_vault_before = vault.totalShares();
    uint256 totalprincipal_vault_before = vault.totalPrincipal();
    uint256 totalunderlying_vault_before = vault.totalUnderlying();

    sponsor(eV, amount, lockDuration, 5);

    uint256 balance_this_after = underlying.balanceOf(currentContract);
    uint256 balance_vault_after = vault.totalSponsored();
    uint256 totalunderlying_vault_after = vault.totalUnderlying();

    assert balance_vault_after == balance_vault_before + amount, "Vault's balance is increased by amount";
    assert balance_this_after == balance_this_before - amount, "(this)'s balance is decreased by amount";
    assert vault.totalShares() == totalshares_vault_before, "Total shares does not change";
    assert vault.totalPrincipal() == totalprincipal_vault_before, "Total principal does not change";
    assert vault.totalUnderlying() == totalunderlying_vault_before + amount, "Total underlying is increased by amount";

}
