# ![Sandclock Logo + Wordmark](./sc_logo.png) Solidity Monorepo

[![Coverage Status](https://coveralls.io/repos/github/lindy-labs/sc_solidity-contracts/badge.svg?branch=main&kill_cache=1)](https://coveralls.io/github/lindy-labs/sc_solidity-contracts)

Solidity implementation of [Sandclock](https://sandclock.org)'s vaults, strategies, and peripheral contracts.

Read the [contracts specification](./documentation/spec.md).

Got a bug to report? Reach out to us at [engineering@sandclock.org](mailto:engineering@sandclock.org?subject=[URGENT]%20Bug%20Report).

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

In order to initialize echidna install [Etheno] version `etheno==0.3a1` and run:

```
$ etheno --ganache --ganache-args "--gasLimit=0x1fffffffffffff --chain.allowUnlimitedContractSize -e 1000000000" -x ./init.json --debug
```

In another terminal run one test, for example:

```
$ NODE_ENV=test yarn hardhat test test/strategy/liquity/LiquityStrategy.spec.ts  --grep "emits a StrategyInvested event" --network etheno
```

Then Ctrl-C in the first terminal (twice) to save. The `init.json`
file may include duplicate contract deployments and furthermore some
contract deployments may be in the wrong order(contract referenced
before it was deployed). This needs to be corrected. Otherwise Echidna
will fail with errors such as:

```
VM failed for unhandled reason, Query <EVM.Query: fetch contract 0x0B1ba0af832d7C05fD64161E0Db78E85978E8082>.
```

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
