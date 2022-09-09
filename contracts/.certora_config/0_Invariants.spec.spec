using MockStrategySync as strategy
using MockERC20 as underlying
using Vault as vault

methods {
    vault.totalUnderlyingMinusSponsored() returns (uint256) envfree;
    vault.totalShares() returns (uint256) envfree;
}

rule pricePerSharePreserved(method f) // For any function f
{ // price per share must be preserved

    calldataarg args; // Arguments needed by f, whatever function might it be

    env e; // Environment used when calling a function 

    uint256 pricePerShareBefore;
    
    require vault.totalUnderlyingMinusSponsored() != 0;
    require vault.totalShares() != 0;

    require pricePerShareBefore == vault.totalUnderlyingMinusSponsored() / vault.totalShares(); // price per share before a function call

    f(e, args);

    assert (pricePerShareBefore == vault.totalUnderlyingMinusSponsored() / vault.totalShares()); // Price per Share Preservation verification

}
