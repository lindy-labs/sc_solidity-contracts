using MockStrategySync as strategy
using MockERC20 as underlying
using Vault as vault

methods {
	underlying.balanceOf(address account) returns (uint256) envfree;
    vault.totalUnderlying() returns (uint256) envfree;
    vault.totalShares() returns (uint256) envfree;
    vault.totalPrincipal() returns (uint256) envfree;
    //vault.totalUnderlyingMinusSponsored() returns (uint256) envfree;
    //vault._applyLossTolerance() returns (uint256) envfree;
}

rule deposit_succeeds {

    address inputToken;
    uint64 lockDuration;
    uint64 amount;
    //string name;
    uint256 slippage;
    uint256 mDGI;

    env eV;

    underlying.mint(eV, currentContract, amount);
    underlying.approve(eV, inputToken, amount);

    uint256 balance_this_before = underlying.balanceOf(currentContract);
    uint256 balance_vault_before = vault.totalUnderlying();
    uint256 totalshares_vault_before = vault.totalShares();
    uint256 totalprincipal_vault_before = vault.totalPrincipal();

    vault.setDGI(eV, mDGI);

    depositParts@withrevert(eV, inputToken, lockDuration, amount/*, name*/, slippage);
    bool succeed = !lastReverted;

    uint256 balance_this_after = underlying.balanceOf(currentContract);
    uint256 balance_vault_after = vault.totalUnderlying();

    /*assert(balance_vault_after == balance_vault_before + amount);
    assert balance_this_after == balance_this_before - amount;
    assert(vault.totalShares() == totalshares_vault_before + (amount * (10 ^ 18)));
    assert(vault.totalPrincipal() == totalprincipal_vault_before + amount);*/
    assert(eV.msg.value == 0 && mDGI < 100 &&
            amount != 0 &&
            inputToken != currentContract /* &&
            lockDuration == 2 * 7 + (lockDuration % (22 * 7)) */
                => succeed);

}
