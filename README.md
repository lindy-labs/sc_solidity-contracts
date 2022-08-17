# ![Sandclock Logo + Wordmark](./sc_logo.png) Solidity Monorepo

![Build Status](https://github.com/lindy-labs/sc_solidity-contracts/workflows/CI/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/lindy-labs/sc_solidity-contracts/badge.svg?branch=main&kill_cache=1)](https://coveralls.io/github/lindy-labs/sc_solidity-contracts)

Solidity implementation of [Sandclock](https://sandclock.org)'s vaults, strategies, and peripheral contracts.

Read the [contracts specification](./documentation/spec.md).

## Build

### The Graph

The deployment setup of subgraph is documented in `bin/reset-docker` (see
section below, about the Docker dev setup)

### Docker dev setup

Run `docker-compose up` to get a full test environment with:

- a ganache node with contracts & fixtures deployed, reachable at
  `http://localhost:8545`
- a subgraph instance, with GraphiQL at `http://localhost:8000`

If you're making changes to contracts and/or deployment setup, you'll need to
re-deploy the contracts, as well as reset the indexed data from subgraph.
A helper script, `bin/reset-docker` is provided which should take care of all
the steps.

### Echidna

First install [Echidna].

Examples:

```
$ echidna-test . --contract Echidna_Valid_Deposit --config contracts/echidna/Echidna_Deposit_Withdraw.yml
```

In order to initialize echidna install [Etheno] and run:

```
$ etheno --ganache --ganache-args "--gasLimit=0x1fffffffffffff --allowUnlimitedContractSize -e 1000000000" -x ./init.json --debug
```

In another terminal run one test, for example:

```
$ yarn hardhat test test/Vault.spec.ts  --grep "works with valid parameters" --network etheno
```

Then Ctrl-C in the first terminal (twice) to save.

[echidna]: https://github.com/crytic/echidna
[etheno]: https://github.com/crytic/etheno

### [Tenderly](https://tenderly.co/)

We are also using Tenderly's Visual Debugger to debug local transactions efficiently.

First you need to create a [tenderly account](https://dashboard.tenderly.co/register).

Then if not installed already, [install tenderly-cli](https://github.com/Tenderly/tenderly-cli#installation) and log in.

To debug any transaction, just run:

```
$ bin/tenderly-debug <tx-hash>
```

with the tx-hash of the respective transaction you want to debug.

### Deployed contracts

Check the [deployments folder](./deployments)
