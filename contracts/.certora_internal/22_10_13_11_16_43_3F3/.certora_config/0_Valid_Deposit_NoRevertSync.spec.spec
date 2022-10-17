using MockStrategySync as strategy
using MockERC20 as underlying
//using Vault as vault

methods {
	underlying.balanceOf(address account) returns (uint256) envfree;
    /*vault.*/totalUnderlying() returns (uint256) envfree;
    /*vault.totalShares() returns (uint256) envfree;
    vault.totalPrincipal() returns (uint256) envfree;*/
}

function mint_helper(address recip, uint256 amount) {
    underlying.mint(recip, amount);
    underlying.approve(currentContract, amount); //
}

rule VaultBalanceIncreases {

    address inputToken;
    uint64 lockDuration;
    uint64 amount;
    string name;
    uint256 slippage;

    env eV;

    require amount > 0;

    mint_helper(eV, currentContract, amount);

    uint256 balance_vault_before = /*vault.*/totalUnderlying();

    //depositParts(eV, inputToken, lockDuration, amount, name, slippage);

    uint256 balance_vault_after = /*vault.*/totalUnderlying();

    assert balance_vault_after == balance_vault_before + amount, "Vault's balance is increased by amount";

}

/*rule ThisBalanceDecreases {

    address inputToken;
    uint64 lockDuration;
    uint64 amount;
    string name;
    uint256 slippage;

    env eV;

    require amount > 0;

    mint_helper(eV, currentContract, amount);

    uint256 balance_this_before = underlying.balanceOf(currentContract);

    depositParts(eV, inputToken, lockDuration, amount, name, slippage);

    uint256 balance_this_after = underlying.balanceOf(currentContract);

    assert balance_this_after == balance_this_before - amount, "(this)'s balance is decreased by amount";

}

rule TotalSharesIncreases {

    address inputToken;
    uint64 lockDuration;
    uint64 amount;
    string name;
    uint256 slippage;

    env eV;

    require amount > 0;

    mint_helper(eV, currentContract, amount);

    uint256 totalshares_vault_before = vault.totalShares();

    depositParts(eV, inputToken, lockDuration, amount, name, slippage);

    assert vault.totalShares() == totalshares_vault_before + (amount * (10 ^ 18)), "Total shares is increased by amount * (10 ^ 18)";

}

rule TotalPrincipalIncreases {

    address inputToken;
    uint64 lockDuration;
    uint64 amount;
    string name;
    uint256 slippage;

    env eV;

    require amount > 0;

    mint_helper(eV, currentContract, amount);

    uint256 totalprincipal_vault_before = vault.totalPrincipal();

    depositParts(eV, inputToken, lockDuration, amount, name, slippage);

    assert vault.totalPrincipal() == totalprincipal_vault_before + amount, "Total principal is increased by amount";

}
*/