methods {
    totalUnderlyingMinusSponsored() returns (uint256) envfree;
    totalShares() returns (uint256) envfree;
}

rule pricePerSharePreserved(method f) // For any function f
filtered { //  that can change state
    f -> (!f.isView) && (!f.isPure)
}
{ // price per share must be preserved

    calldataarg args; // Arguments needed by f, whatever function might it be

    env e; // Environment used when calling a function 

    uint256 pricePerShareBefore;
    
    require pricePerShareBefore == totalUnderlyingMinusSponsored() / totalShares(); // price per share before a function call

    f(e, args);

    assert (pricePerShareBefore == totalUnderlyingMinusSponsored() / totalShares()); // Price per Share Preservation verification

}
