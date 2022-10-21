using MockStrategySync as strategy
using MockERC20 as underlying

methods {
    totalUnderlyingMinusSponsored() returns (uint256) envfree;
    totalShares() returns (uint256) envfree;
}

rule pricePerSharePreserved(method f) // For any function f
{ // price per share must be preserved

    require (f.selector == deposit((address,uint64,uint256,(uint16,address,bytes)[],string,uint256)).selector
            || f.selector == withdraw(address,uint256[]).selector);

    calldataarg args; // Arguments needed by f, whatever function might it be

    env e; // Environment used when calling a function 

    uint256 pricePerShareBefore;
    
    require totalUnderlyingMinusSponsored() != 0;
    require totalShares() != 0;

    require pricePerShareBefore == totalUnderlyingMinusSponsored() / totalShares(); // price per share before a function call

    f(e, args);

    assert pricePerShareBefore == totalUnderlyingMinusSponsored() / totalShares(), "Price per share must be preserved by function ${f}";

}
