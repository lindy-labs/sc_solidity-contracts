using MockUST as underlying

methods {
	underlying.balanceOf(address account) returns (uint256) envfree;
    totalUnderlying() returns (uint256) envfree;
    totalShares() returns (uint256) envfree;
    totalPrincipal() returns (uint256) envfree;
}

rule VaultBalanceIncreases {

    env eV;
    uint256 amount;

    require amount == 100; // This is the link between deposit and Certora via the generic argument arg below

    underlying.mint(eV, eV.msg.sender, amount);
    underlying.approve(eV, currentContract, amount); //address(vault)

    uint256 balance_vault_before = totalUnderlying();

    calldataarg arg; // DepositParams is inside arg implicitly

    deposit(eV, arg); // Generic call because Certora does not support arrays inside structures explicitly

    uint256 balance_vault_after = totalUnderlying();

    assert balance_vault_after == balance_vault_before + amount, "Vault's balance is increased by amount";

}
/*
rule ThisBalanceDecreases {

    env eV;
    uint256 amount;

    require amount > 0;

    underlying.mint(eV, eV.msg.sender, amount);
    underlying.approve(eV, currentContract, amount); //address(vault)

    uint256 balance_this_before = underlying.balanceOf(currentContract);

    calldataarg arg; // DepositParams is inside arg implicitly

    deposit(eV, arg); // Generic call because Certora does not support arrays inside structures explicitly

    uint256 balance_this_after = underlying.balanceOf(currentContract);

    assert balance_this_after == balance_this_before - amount, "(this)'s balance is decreased by amount";

}

rule TotalSharesIncreases {

    env eV;
    uint256 amount;

    require amount > 0;

    underlying.mint(eV, eV.msg.sender, amount);
    underlying.approve(eV, currentContract, amount); //address(vault)

    uint256 totalshares_vault_before = totalShares();

    calldataarg arg; // DepositParams is inside arg implicitly

    deposit(eV, arg); // Generic call because Certora does not support arrays inside structures explicitly

    assert totalShares() == totalshares_vault_before + (amount * (10 ^ 18)), "Total shares is increased by amount * (10 ^ 18)";

}

rule TotalPrincipalIncreases {

    env eV;
    uint256 amount;

    require amount > 0;

    underlying.mint(eV, eV.msg.sender, amount);
    underlying.approve(eV, currentContract, amount); //address(vault)

    uint256 totalprincipal_vault_before = totalPrincipal();

    calldataarg arg; // DepositParams is inside arg implicitly

    deposit(eV, arg); // Generic call because Certora does not support arrays inside structures explicitly

    assert totalPrincipal() == totalprincipal_vault_before - amount, "Total principal is increased by amount";

}
*/