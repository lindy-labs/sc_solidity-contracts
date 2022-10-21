using MockStrategySync as strategy
using MockERC20 as underlying

methods {
	underlying.balanceOf(address account) returns (uint256) envfree;
    totalUnderlying() returns (uint256) envfree;
    totalShares() returns (uint256) envfree;
    totalPrincipal() returns (uint256) envfree;
    totalSponsored() returns (uint256) envfree;
}

rule sponsorVaultBalanceIncreasesByAmount {

    uint64 lockDuration;
    uint64 amount;
    address addForSponsor;

    env eV;

    setAmountFromCertora(eV, amount); // This is a communication link between Certora and Vault
    underlying.mint(eV, currentContract, amount);

    uint256 balance_vault_before = totalSponsored();

    sponsor(eV, addForSponsor, amount, lockDuration, 5);

    uint256 balance_vault_after = totalSponsored();

    assert balance_vault_after == balance_vault_before + amount, "Vault's balance is increased by amount";

}

rule sponsorThisBalanceDecreasesByAmount {

    uint64 lockDuration;
    uint64 amount;
    address addForSponsor;

    env eV;

    setAmountFromCertora(eV, amount); // This is a communication link between Certora and Vault
    underlying.mint(eV, currentContract, amount);

    uint256 balance_this_before = underlying.balanceOf(currentContract);

    sponsor(eV, addForSponsor, amount, lockDuration, 5);

    uint256 balance_this_after = underlying.balanceOf(currentContract);

    assert balance_this_after == balance_this_before - amount, "(this)'s balance is decreased by amount";

}

rule sponsorTotalSharesDoesNotChange {

    uint64 lockDuration;
    uint64 amount;
    address addForSponsor;

    env eV;

    setAmountFromCertora(eV, amount); // This is a communication link between Certora and Vault
    underlying.mint(eV, currentContract, amount);

    uint256 totalshares_vault_before = totalShares();

    sponsor(eV, addForSponsor, amount, lockDuration, 5);

    assert totalShares() == totalshares_vault_before, "Total shares does not change";

}

rule sponsorTotalPrincipalDoesNotChange {

    uint64 lockDuration;
    uint64 amount;
    address addForSponsor;

    env eV;

    setAmountFromCertora(eV, amount); // This is a communication link between Certora and Vault
    underlying.mint(eV, currentContract, amount);

    uint256 totalprincipal_vault_before = totalPrincipal();

    sponsor(eV, addForSponsor, amount, lockDuration, 5);

    assert totalPrincipal() == totalprincipal_vault_before, "Total principal does not change";

}

rule sponsorTotalUnderlyingIncreasesByAmount {

    uint64 lockDuration;
    uint64 amount;
    address addForSponsor;

    env eV;

    setAmountFromCertora(eV, amount); // This is a communication link between Certora and Vault
    underlying.mint(eV, currentContract, amount);

    uint256 totalunderlying_vault_before = totalUnderlying();

    sponsor(eV, addForSponsor, amount, lockDuration, 5);

    assert totalUnderlying() == totalunderlying_vault_before + amount, "Total underlying is increased by amount";

}
