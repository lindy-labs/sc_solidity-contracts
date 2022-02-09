# Sandclock's Solidity Monorepo

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

* **EthAnchorUSTStrategy**: Requires the underlying to be `UST`, and invests it via
    [EthAnchor]
* **EthAnchorNonUSTStrategy**: Takes an ERC20 underlying, converts it to UST, and
    then pipes it to [EthAnchor]. The underlying is converted using
    [Curve], so a corresponding pool must exist.

[Sandclock]: https://sandclock.org
[Curve]: https://curve.fi
[EthAnchor]: https://docs.anchorprotocol.com/ethanchor/ethanchor

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

