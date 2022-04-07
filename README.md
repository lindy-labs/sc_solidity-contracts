# Sandclock's Solidity Monorepo

![Build Status](https://github.com/lindy-labs/sc_solidity-contracts/workflows/CI/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/lindy-labs/sc_solidity-contracts/badge.svg)](https://coveralls.io/github/lindy-labs/sc_solidity-contracts)

Solidity implementation of [Sandclock]'s vaults, strategies, and peripheral contracts.

## Contracts

### Vault

Main contract that holds deposits made in an underlying ERC20 token, and
communicates with a strategy to generate yield for those deposits.

Both principal and yield can be distributed to other beneficiaries (e.g.: as
donations), who then are entitled to claim their principal/yield after the
initial lock period.

### IStrategy

Interface for a strategy. Strategies are attached to vaults, in a 1-1
relationship, and receive a share of their underlying balance (defined by
Vault's `investPct` percentage), and interfaces with yield-generating services
to produce yield on behalf of the vault.

Currently implemented strategies are:

- **AnchorUSTStrategy**: Requires the underlying to be `UST`, and invests it via
  [EthAnchor]
- **AnchorNonUSTStrategy**: Takes an ERC20 underlying, converts it to UST, and
  then pipes it to [EthAnchor]. The underlying is converted using
  [Curve], so a corresponding pool must exist.

The following strategies are used on ropsten testnet, since testnet does not have chainlink feed and curve to swap UST.

- **TestAnchorUSTStrategy**: Requires the underlying to be `UST`, and invests it via
  [EthAnchor]
- **TestAnchorNonUSTStrategy**: Takes an ERC20 underlying, converts it to UST, and
  then pipes it to [EthAnchor]. The underlying is converted using
  [Uniswap], so a corresponding pool must exist.

[sandclock]: https://sandclock.org
[curve]: https://curve.fi
[ethanchor]: https://docs.anchorprotocol.com/ethanchor/ethanchor
[uniswap]: https://uniswap.org/

## The Graph

The deployment setup of subgraph is documented in `bin/reset-docker` (see
section below, about the Docker dev setup)

## Docker dev setup

Run `docker-compose up` to get a full test environment with:

- a ganache node with contracts & fixtures deployed, reachable at
  `http://localhost:8545`
- a subgraph instance, with GraphiQL at `http://localhost:8000`

If you're making changes to contracts and/or deployment setup, you'll need to
re-deploy the contracts, as well as reset the indexed data from subgraph.
A helper script, `bin/reset-docker` is provided which should take care of all
the steps.

## Echidna

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

## Deployed contracts

Check the [deployments folder](./deployments)
