

![Certora](https://hackmd.io/_uploads/H1yqrfBZY.png)
# Formal Verification of Vault contract  
 



## Summary

This document describes the specification and verification of Vault using the Certora Prover. 

The scope of this verification is the [`Vault.sol`](https://github.com/lindy-labs/sc_solidity-contracts/blob/main/contracts/Vault.sol) contract.

The Certora Prover proved the implementation of the Vault contract is correct with respect to formal specifications written by the security team of Lindy Labs.  The team also performed a manual audit of these contracts.

## List of Main Issues Discovered

**Severity: <span style="color:Red">Critical</span>**

| Issue:            | | 
| --------          | -------- |    
| Description:      | | 
| Mitigation/Fix:   | |
| Property violated:| |

**Severity: <span style="color:Orange">High</span>**

| Issue:            | | 
| --------          | -------- |    
| Description:      | | 
| Mitigation/Fix:   | |
| Property violated:| |

**Severity: <span style="color:Blue">Medium</span>**

| Issue:            | | 
| --------          | -------- |    
| Description:      | | 
| Mitigation/Fix:   | |
| Property violated:| |

**Severity: <span style="color:tan">Low  </span>**

| Issue:            | | 
| --------          | -------- |    
| Description:      | | 
| Mitigation/Fix:   | |
| Property violated:| |

**Severity: <span style="color:Grey">Recommendation</span>**

| Issue:            | | 
| --------          | -------- |    
| Description:      | | 
| Mitigation/Fix:   | |
| Property violated:| |


# Overview of the verification

## Description of the Vault contract

TODO

## Assumptions and Simplifications

We made the following assumptions during the verification process:

- TODO

## Verification Conditions
### Notation
✔️ indicates the rule is formally verified on the latest reviewed commit. Footnotes describe any simplifications or assumptions used while verifying the rules (beyond the general assumptions listed above).


In this document, verification conditions are either shown as logical formulas or Hoare triples of the form {p} C {q}. A verification condition given by a logical formula denotes an invariant that holds if every reachable state satisfies the condition.

Hoare triples of the form {p} C {q} holds if any non-reverting execution of program C that starts in a state satsifying the precondition p ends in a state satisfying the postcondition q. The notation {p} C@withrevert {q} is similar but applies to both reverting and non-reverting executions. Preconditions and postconditions are similar to the Solidity require and assert statements.

Formulas relate the results of method calls. In most cases, these methods are getters defined in the contracts, but in some cases they are getters we have added to our harness or definitions provided in the rules file. Undefined variables in the formulas are treated as arbitrary: the rule is checked for every possible value of the variables.


### Rules
#### 1. ✔️
    
```
```