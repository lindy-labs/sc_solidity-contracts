using MockStrategySync as strategy
using MockERC20 as underlying
using Vault as vault
using ERC20 as erc20

methods {
	underlying.balanceOf(address account) returns (uint256) envfree;
    vault.totalUnderlying() returns (uint256) envfree;
    vault.totalShares() returns (uint256) envfree;
    vault.totalPrincipal() returns (uint256) envfree;
}

ghost ghost_balances(address) returns uint256;

hook Sstore erc20._balances[KEY address account] uint256 v STORAGE {
  havoc ghost_balances assuming ghost_balances@new(account) == v && 
        (forall address a. a != account =>
            ghost_balances@new(a) == ghost_balances@old(a));
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

    uint256 balance_vault_before = vault.totalUnderlying();

    //depositParts(eV, inputToken, lockDuration, amount, name, slippage);

    uint256 balance_vault_after = vault.totalUnderlying();

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