---
description: Internal due diligence
---

# Internal

## Smart Contract Testing [![Coverage Status](https://coveralls.io/repos/github/lindy-labs/sc\_solidity-contracts/badge.svg?branch=main\&kill\_cache=1)](https://coveralls.io/github/lindy-labs/sc\_solidity-contracts)

Sandclock's codebase features a comprehensive test suite, relying on unit and integration tests, as well as advanced fuzzing assertion tests and even CVL specifications.

### Formal Verification

Mission critical parts of Sandclock's contracts have been formally verified by Lindy Labs. For information on which properties have been proven, check the [vault-properties.md](../specification/vault/vault-properties.md "mention") and  [strategy-properties.md](../specification/strategies/strategy-properties.md "mention") documents.

For a more thorough overview, consult [https://github.com/lindy-labs/sc\_solidity-contracts/tree/Formal-Verification](https://github.com/lindy-labs/sc\_solidity-contracts/tree/Formal-Verification).

## Monitoring

### Smart Contracts

OpenZeppelin Defender is used to monitor our vault and strategy contracts.

### Frontend

Below will be all the ways in which we ensure the frontend has not been tampered with.

\[WIP]
