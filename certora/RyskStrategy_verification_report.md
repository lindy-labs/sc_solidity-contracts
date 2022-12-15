![Certora](https://hackmd.io/_uploads/H1yqrfBZY.png)
# Formal Verification of RyskStrategy contract

## Summary

This document describes the specification and verification of RyskStrategy using the Certora Prover. 

The scope of this verification is the [`Vault.sol`](https://github.com/lindy-labs/sc_solidity-contracts/blob/main/contracts/Vault.sol) contract. Its specification is available [here](specs/Vault.spec).

The Certora Prover proved the implementation of the Vault contract is correct with respect to formal specifications written by the security team of Lindy Labs.  The team also performed a manual audit of these contracts.

## List of Issues Discovered

# Overview of the verification

## Description of the LiquityStrategy contract

## Assumptions and Simplifications

We made the following assumptions during the verification process:

- We unroll loops by max 3 times. Violations that require a loop to execute more than 3 times will not be detected.
- When verifying contracts that make external calls, we assume that those calls can have arbitrary side effects outside of the contracts, but that they do not affect the state of the contract being verified. This means that some reentrancy bugs may not be caught. However, the previous audits should have already covered all the possible reentrancy attacks
- The strategy contract never calls the functions in the Vault.

## Verification Conditions
### Notation
✔️ indicates the rule is formally verified on the latest reviewed commit. Footnotes describe any simplifications or assumptions used while verifying the rules (beyond the general assumptions listed above).


In this document, verification conditions are either shown as logical formulas or Hoare triples of the form {p} C {q}. A verification condition given by a logical formula denotes an invariant that holds if every reachable state satisfies the condition.

Hoare triples of the form {p} C {q} holds if any non-reverting execution of program C that starts in a state satsifying the precondition p ends in a state satisfying the postcondition q. The notation {p} C@withrevert {q} is similar but applies to both reverting and non-reverting executions. Preconditions and postconditions are similar to the Solidity require and statements.

Formulas relate the results of method calls. In most cases, these methods are getters defined in the contracts, but in some cases they are getters we have added to our harness or definitions provided in the rules file. Undefined variables in the formulas are treated as arbitrary: the rule is checked for every possible value of the variables.

## RyskStrategy

### Rules