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

## Deployed contracts

### Ropsten Testnet

| Name         | Contract                 | Address                                                                                                                       |
| ------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| USTVault     | Vault                    | [0x135055b3f44c8511d1c2c078c93ba7ff53c8c72e](https://ropsten.etherscan.io/address/0x135055b3f44c8511d1c2c078c93ba7ff53c8c72e) |
| USTStrategy  | TestUSTAnchorStrategy    | [0x0Ac1d08a5F8C535d002b236E0CA9f94822407B04](https://ropsten.etherscan.io/address/0x0Ac1d08a5F8C535d002b236E0CA9f94822407B04) |
| USDTVault    | Vault                    | [0x135055B3f44c8511D1c2c078c93BA7ff53c8c72E](https://ropsten.etherscan.io/address/0x135055B3f44c8511D1c2c078c93BA7ff53c8c72E) |
| USDTStrategy | TestNonUSTAnchorStrategy | [0xd5984553718867ab6b266220bdda6176ab688f2e](https://ropsten.etherscan.io/address/0xd5984553718867ab6b266220bdda6176ab688f2e) |
| USDCVault    | Vault                    | [0xcEbdBeC07C66ABD29083240DefcDd4837452e2Ab](https://ropsten.etherscan.io/address/0xcEbdBeC07C66ABD29083240DefcDd4837452e2Ab) |
| USDCStrategy | TestNonUSTAnchorStrategy | [0x5ECdb6E6d0BA18d05b263D49717134ae9bCC2dC3](https://ropsten.etherscan.io/address/0x5ECdb6E6d0BA18d05b263D49717134ae9bCC2dC3) |
| DAIVault     | Vault                    | [0x615816ebE7faA3a2b7b0eEb0248e06650Fe31d95](https://ropsten.etherscan.io/address/0x615816ebE7faA3a2b7b0eEb0248e06650Fe31d95) |
| DAIStrategy  | TestNonUSTAnchorStrategy | [0xfba53c466935118256981a6BA4f546da766cCdF3](https://ropsten.etherscan.io/address/0xfba53c466935118256981a6BA4f546da766cCdF3) |
