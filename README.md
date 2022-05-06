# Sandclock's Solidity Monorepo

![Build Status](https://github.com/lindy-labs/sc_solidity-contracts/workflows/CI/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/lindy-labs/sc_solidity-contracts/badge.svg)](https://coveralls.io/github/lindy-labs/sc_solidity-contracts)

Solidity implementation of [Sandclock]'s vaults, strategies, and peripheral contracts.

## Contracts

Two contracts make up Sandclock's core: vault and strategy. The vault is the contract users interact with to deposit, withdraw, claim yield, admin, etc, and the strategy is the contract that invests the users’ funds to generate yield.

### Strategy

Each vault can only have one strategy, but any contract can be a strategy as long as it implements the required interface. We can replace the strategy at any moment by withdrawing all the funds to the vault, updating the address of the strategy, and rebalancing the vault.

At the moment, the only strategy we have is written on top of Anchor Protocol, but more will follow. For the purposes of this audit, the strategy contract pertains solely to EthAnchor.

Anchor uses UST. As such, we use UST as the underlying for the vault, allowing us to save on conversion fees and create more predictability for our users. Still, the underlying could be almost any other ERC20 that is also a stable coin.

Because of Anchor’s asynchronous nature, our strategy is also asynchronous, and requires a backend to finish some operations: when the vault transfers underlying to the strategy, the strategy starts a deposit operation on Anchor, but later on, someone has to call the finish operation for the deposit to take effect. The backend handles these calls. The same applies to withdrawals. These operations could also be “finished” manually by anyone, but the backend helps automate the process.

### Vault

The vault is the centerpiece of the system. It,

- keeps track of deposits, sponsors, and yield;
- decides how much to invest or disinvest in the strategy;
- applies the performance fee to the yield;
- handles most administrative tasks.

Regular users will interact with the vault by depositing/creating a “Metavault,” withdrawing, and claiming yield. While the current vault uses UST as the underlying, users can deposit in other currencies. Underneath, we use Curve to convert those deposits to UST. The same doesn’t apply to withdrawals, which are always in UST.

Besides depositing and withdrawing funds, depositors can specify where they want to send their yield. This is one of the most significant innovations of Sandclock: you can deposit money and assign the yield it generates to anyone. Yield can be assigned to the depositor, another account, or Sandclocks’ treasury in case of a donation which requires centralized infrastructure.

#### Accounting

In other applications, similar to Sandclock, you would deposit your money into a vault and get back receipt tokens that represent the funds deposited. You can typically burn these tokens and get your funds back. Ideally, the tokens would have gained value which meant you got even more money back. This is important because Sandclock doesn't work like that at all. We have the concept of shares that increase/decrease in value, but they don't mean anything to our users, and no one owns any fixed amount of shares. You cannot sell or transfer shares, and the number of shares assigned to an account might change at any time.

For instance, when you deposit 100 UST, your deposit will be assigned an initial 100 x 10^18 shares, before the strategy starts doing its thing and the conversation rate changes. Before any operation, we use this number to check if your deposit is safe or not: if 100 x 10^18 shares are worth less than 100 UST, the vault enters loss mode (more on this later).

From the claimer’s point of view, a deposit of 100 UST will add 100 principal and 100 x 10^18 shares to the claimer’s global counters. At any moment, the difference between the principal and what the shares are worth is the claimer’s yield.

To claim the yield, we,

1. subtract the claimer’s total principal from the worth of the total shares to get the yield;
2. convert the yield to shares to get how much that yield is worth in shares;
3. decrease those shares from the claimer’s total shares;
4. transfer the yield to the claimer. 

At the end of the process, the vault has fewer shares, but the value of each share remains the same because it is balanced out by the fact money was transferred to the claimer. Notice that we never touch the number of shares assigned to the deposit, that's just a reference number that represents the initial shares.

When the depositor decides that it’s time to withdraw, we,

1. take the deposit’s amount;
2. convert it to shares;
3. subtract the shares from the claimer’s total shares; 
4. subtract the amount from the claimer’s total principal;
5. delete the deposit; 
6. transfer the amount to the depositor. 

Same as above, at the end of the process, the vault has fewer shares and less principal, which ensures the value of each share doesn’t change. This mechanism ensures that the yield that has not been claimed belongs to the claimer and is not withdrawn by the depositor.

As you can see, both the depositor and the claimer can burn shares because shares don’t belong to anyone. Sure, after the depositor withdraws, only the claimer can burn the remaining shares, but those can be worth 0 if the vault enters loss mode.

Keep in mind that none of this applies during a loss scenario, where both claims and deposits are blocked.

#### Metavault

The concept of a Metavault may appear at the front-end level, but it doesn't translate into the contracts. For the contracts, a Metavault is a collection of connected deposits because they were created together as part of a system where the user decided that it wanted to donate X yield to one place, Y yield to another. That decision will generate multiple deposits connected through a groupId in the contracts. That's a Metavault. You may notice that the groupId is just a global counter that's incremented and emitted because it has no value for the contracts.

#### Partial withdrawals

Ideally, a depositor will make a deposit, have it generate yield, and eventually withdraw that deposit. But Anchor works asynchronously, so our strategy is also asynchronous, meaning users can't withdraw funds directly from the strategy. Because of that, the vault keeps some funds, let’s say 5% of the TVL, to handle withdrawals and claims. The vault and strategy regularly rebalance to ensure those 5% percent are in the vault.

The issue with the approach above is that any deposit worth more than 5% of the TVL cannot be withdrawn. We solve that with partial withdrawals that allow a depositor to reduce the size of the deposit, taking into account the funds available in the vault. Sure, they will have to wait for the vault and strategy to rebalance to withdraw for more funds to be available, but that's part of the deal.

#### Sponsors

The vault supports sponsors: users who deposit but forfeit their yield to the claimers. It is likely that the Sandclock DAO will be the sole sponsor as there’s no real incentive for sponsoring the vault. The only use of a sponsor is to boost the vault’s yield. However, a misbehaving sponsor can also boost losses, so sponsors need to be allowed before they can sponsor.

#### Loss mode

The vault enters loss mode when all the shares are worth less than all the deposits (the principal), which is the same as saying that the underlying is lower than the deposits. This means that the strategy has lost funds beyond the initial deposits, and is now indebted to its depositors. No one can claim or deposit when this happens, and only withdrawals at a loss are allowed. Keep in mind that you will not find any restrictions to prevent claims or withdrawals; these limitations are part of the design.

In a loss scenario, the vault tries to distribute loss evenly amongst depositors: if the vault lost 10%, then every withdrawal will take a 10% hit, *kind of*. In a 10% loss scenario, a deposit of 100 UST may be worth more or less than 90 UST depending on how much of the yield the claimer of that deposit didn't claim. We need to look at the math to understand how it works.

The vault keeps track of each claimer's total principal and total shares (we have explained these in a section above, but the total principal of a claimer is the sum of all the deposits to that claimer). To calculate how much a deposit is worth during a loss scenario, the vault takes the size of your deposit and divides it by the total principal of the claimer. The result of this operation is a percentage that is then multiplied by the total shares of that claimer. You convert the resulting shares to underlying, and this is how much your deposit is worth. You already know that the shares are worth less than the principal; otherwise, we would not be in a loss scenario.

In the explanation above, we need to pay attention to the details. While in theory, two claimers with a total principal of 100 UST each may have the same number of shares, this is very unlikely. A deposit of 20 UST to claimer 1 may be worth more (or less) than another deposit of 20 UST to claimer 2, depending on the total number of shares of that claimer! And how come those two claimers can have a different number of shares? It's simple: *unclaimed yield*.

You deposited 100 UST at a conversion rate of 1 UST = 2 shares, buying yourself 200 shares. Later, someone else deposits 100 UST at a rate of 1 UST = 1 share, buying 100 shares. Your deposit is worth twice as many shares as theirs because half of your shares are yield. You'll burn half the shares if you claim, and your 100 UST deposit is also worth 100 shares like the other depositor. But, if you don't claim and the vault suddenly drops into a loss, you own twice as many shares as the other depositor, and therefore your loss will be smaller than theirs. This math can be messy when there are multiple depositors to the same claimer, but the same principle applies: more unclaimed yield will usually result in smaller losses.

#### Forced Withdrawal

You have to perform a forced withdrawal in order to withdraw during a loss scenario. This means you forfeit the remaining funds, unlike partial withdrawals, where you still keep them for later (partial withdrawals are not available during a loss scenario). The mechanic for forced withdrawal is the same as for a regular withdrawal, but the number of shares and the amount you get is calculated using the logic mentioned above.

#### Temporary Loss-Mode

Because Anchor takes a fee for deposits, we could temporarily enter loss mode while the strategy is investing the funds. It is unlikely to happen after the initial phase. Still, to account for that, the vault allows for a tolerance fee determined by the strategy before it enters loss mode.

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

### Deployed contracts

Check the [deployments folder](./deployments)
