using MockERC20 as underlying
using Vault as vault

rule deposit_reverts_with_zero_amount {

    address inputToken;
    uint64 lockDuration;
    uint64 amount;
    string name;
    uint256 slippage;

    env eV;

    require inputToken != currentContract;
    require lockDuration == 2 * 7 + (lockDuration % (22 * 7));

    underlying.mint(eV, currentContract, amount);
    underlying.approve(eV, inputToken, amount);

    depositParts@withrevert(eV, inputToken, lockDuration, amount, name, slippage);

    assert amount == 0 => lastReverted;

}
