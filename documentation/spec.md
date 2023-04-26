# Specification

Two contracts make up Sandclock's core: vault and strategy. The vault is the contract users interact with to deposit, withdraw, claim yield, admin, etc, and the strategy is the contract that invests the users’ funds to generate yield.

The following image contains multiple flow diagrams that show the actions and procedures inside the vault.

![Flow Diagrams](./flow.jpeg)

## Strategy

Each vault can only have one strategy, but any contract can be a strategy as long as it implements the required interface. We can replace the strategy at any moment by withdrawing all the funds to the vault, updating the address of the strategy, and rebalancing the vault.

For the purposes of testing, there is one strategy built on the Anchor Protocol and another built on top of a Yearn vault. The strategy built on Anchor will not be deployed because the protocol crashed. However, we are keeping it around as a reference implementation and ensuring that the vault would still work in a similar strategy.

Each strategy uses the same underlying as the contract it interacts with. For instance, when we deploy a strategy using Yearn’s LUSD Vault, our strategy will use LUSD (Liquity USD) as the underlying, and the same goes for our vault. However, the vault integrates with Curve to allow our users to deposit in different currencies. The underlying could be almost any other ERC20 that is also a stable coin.

Each strategy can be synchronous or asynchronous, depending on whether their interactions can have an immediate effect. When withdrawing from a strategy, can the withdrawal request be fulfilled immediately? Or do we have to wait for it to be fulfilled later?

**Synchronous strategies**

Our strategy built on Yearn is synchronous because we can withdraw our invested assets anytime and without delay. Each time the strategy invests into a Yearn vault, it receives wrapped ERC20 that accumulate value. When it’s time to withdraw, we exchange the wrapped ERC20 back into more (or less) of the original ERC20.

With a synchronous strategy, our vault can always fulfill an order, even when there aren’t enough funds in the reserves.

**Asynchronous strategies**

An asynchronous strategy is not able to fulfill requests immediately. For instance, when withdrawing from Anchor, our strategy sends a withdrawal request that has to be fulfilled later by our backend or manually. Therefore, when there aren’t enough funds on the vault’s reserves to fulfill a withdrawal, the request will fail, and the users have to wait until the vault and strategy rebalance for more funds to be available.

## Vault

The vault is the centerpiece of the system. It,

- keeps track of deposits, sponsors, and yield;
- decides how much to invest or disinvest in the strategy;
- applies the performance fee to the yield;
- handles most administrative tasks.

Regular users will interact with the vault by depositing/creating a “Metavault,” withdrawing, and claiming yield. While the vault uses the same underlying as the strategy, users can deposit in other currencies. Underneath, we use Curve to convert those deposits. The same doesn’t apply to withdrawals, which are always in underlying.

Besides depositing and withdrawing funds, depositors can specify where they want to send their yield. This is one of the most significant innovations of Sandclock: you can deposit money and assign the yield it generates to anyone. Yield can be assigned to the depositor, another account, or Sandclocks’ treasury in case of a donation.

Upon creation of the vault, the investment percentage parameter dictates how much of the total funds will be invested through the strategy. The rest of the funds are held by the vault as reserves and serve to support withdrawals and claims.

The vault supports both synchronous and asynchronous strategies. The difference between these two modes is reflected in the way how withdrawals from the vault are handled.

In sync mode, the withdrawals are instantaneous. A user can withdraw his funds invested in the vault at any time without a delay, assuming that the initial locked period on the vault has expired. When the user wants to withdraw an amount that is greater than the vault’s reserves, the vault will immediately rebalance with the strategy, and the withdrawal will go through.

In async mode, withdrawals and claims will fail if there aren’t enough funds in the vault’s reserves. The users have to wait for the backend to rebalance the vault with the strategy so more funds become available.

### Metavault

The concept of the Metavault appears at the front end but doesn't translate in the contracts. For the contracts, a Metavault is a collection of connected deposits because they were created together as part of a system where the user decided that it wanted to donate X yield to one place, Y yield to another. That decision will generate multiple deposits connected through a `groupId` in the contracts. That's a Metavault. You may notice that the `groupId` is just a global counter that's incremented and emitted because it has no value for the contracts.

### Partial withdrawals

Ideally, a depositor will make a deposit, have it generate yield, and eventually withdraw that deposit. If the strategy being used is asynchronous, users can't withdraw funds directly from the strategy, and that’s one of the reasons the vault keeps some funds in a reserve, let’s say 5% of the TVL. The vault and strategy regularly rebalance to ensure those 5% percent are in the vault.

The issue with the approach above is that any deposit worth more than 5% of the TVL cannot be withdrawn. We solve that with partial withdrawals that allow a depositor to reduce the size of the deposit, taking into account the funds available in the vault. Sure, they will have to wait for the vault and strategy to rebalance to withdraw for more funds to be available, but that's part of the deal.

### Sponsors

The vault supports sponsors: users who deposit but forfeit their yield to the claimers. It is likely that the Sandclock DAO will be the sole sponsor as there’s no real incentive for sponsoring the vault. The only use of a sponsor is to boost the vault’s yield. However, a misbehaving sponsor can also boost losses, so sponsors need to be allowed before they can sponsor.

## Shares explained

In other applications, similar to Sandclock, you would deposit your money into a vault and get back receipt tokens that represent the funds deposited. You can typically burn these tokens and get your funds back. Ideally, the tokens would have gained value which meant you got even more money back. This is important because Sandclock doesn't work like that at all. We have the concept of shares that increase/decrease in value, but they don't mean anything to our users, and no one owns any fixed amount of shares. You cannot sell or transfer shares, and the number of shares assigned to an account might change at any time.

For instance, when you deposit 100 LUSD, your deposit will be assigned an initial 100 x 10^18 shares, before the strategy starts doing its thing and the conversation rate changes. Before any operation, we use this number to check if your deposit is safe or not: if 100 x 10^18 shares are worth less than 100 LUSD, the vault enters loss mode (more on this later).

From the claimer’s point of view, a deposit of 100 LUSD will add 100 principal and 100 x 10^18 shares to the claimer’s global counters. At any moment, the difference between the principal and what the shares are worth is the claimer’s yield.

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

## Loss Mode

The vault enters loss mode when the shares are worth less than all the deposits (the principal), which is the same as saying that the underlying is lower than the deposits. This means that the strategy has lost funds beyond the initial deposits, and is now indebted to its depositors. No one can claim or deposit when this happens, and only withdrawals at a loss are allowed. Keep in mind that you will not find any restrictions to prevent claims or withdrawals; these limitations are part of the design.

In a loss scenario, the vault tries to distribute loss evenly amongst depositors: if the vault lost 10%, then every withdrawal will take a 10% hit, _kind of_. In a 10% loss scenario, a deposit of 100 LUSD may be worth more or less than 90 LUSD depending on how much of the yield the claimer of that deposit didn't claim. We need to look at the math to understand how it works.

The vault keeps track of each claimer's total principal and total shares (we have explained these in the section above, but the total principal of a claimer is the sum of all the deposits to that claimer). To calculate how much a deposit is worth during a loss scenario, the vault takes the size of your deposit and divides it by the total principal of the claimer. The result of this operation is a percentage that is then multiplied by the total shares of that claimer. You convert the resulting shares to underlying, and this is how much your deposit is worth. You already know that the shares are worth less than the principal; otherwise, we would not be in a loss scenario.

In the explanation above, we need to pay attention to the details. While in theory, two claimers with a total principal of 100 LUSD each may have the same number of shares, this is very unlikely. A deposit of 20 LUSD to claimer 1 may be worth more (or less) than another deposit of 20 LUSD to claimer 2, depending on the total number of shares of that claimer! And how come those two claimers can have a different number of shares? It's simple: _unclaimed yield_.

You deposited 100 LUSD at a conversion rate of 1 LUSD = 2 shares, buying yourself 200 shares. Later, someone else deposits 100 LUSD at a rate of 1 LUSD = 1 share, buying 100 shares. Your deposit is worth twice as many shares as theirs because half of your shares are yield. You'll burn half the shares if you claim, and your 100 LUSD deposit is also worth 100 shares like the other depositor. But, if you don't claim and the vault suddenly drops into a loss, you own twice as many shares as the other depositor, and therefore your loss will be smaller than theirs. This math can be messy when there are multiple depositors to the same claimer, but the same principle applies: more unclaimed yield will usually result in smaller losses.

### User Debt And Partial Loss Mode

As you can tell from the previous section, the amount you can withdraw during a loss scenario depends on how much yield the claimer claimed. But this is not where the story ends, and there's another essential detail regarding deposits.

Imagine there's a User A that deposits 100 underlying to some user and receives 100 shares. The vault generates 100 yield, and User B deposits 100 to User C, receiving 50 shares. Later, the vault loses 50 yield. At this point, the vault didn't enter a global loss mode because the total principal (200) is less than the total underlying (250), but User B lost funds while User A didn't. The total principal is 200 underlying, the yield is 50, and there are 150 shares. The price per share is 250 / 150 =~ 1,666667. User B's shares are worth 50 shares _ 1,666667 = 83 underlying, and User A's shares are worth 100 shares _ 1,666667 = 166 underlying. User C is in debt, and their depositors have lost funds. Therefore, regular withdrawals for those deposits are not allowed. New deposits to User C are also blocked because otherwise, there would be an instant loss of funds: the debt would be distributed between the current depositors and the new ones. At the same time, User A can continue to utilize the platform fully. Loss mode will also apply to users who are in debt.

### Forced Withdrawal

You have to perform a forced withdrawal in order to withdraw during a loss scenario. This means you forfeit the remaining funds, unlike partial withdrawals, where you still keep them for later (partial withdrawals are not available during a loss scenario). The mechanic for forced withdrawal is the same as for a regular withdrawal, but the number of shares and the amount you get is calculated using the logic mentioned above.

### Temporary loss-mode

The strategy may charge fees during the investment process that would trigger a temporary loss mode before yield is generated. It is unlikely to happen after the initial deposits. Still, to account for that, the vault has a loss tolerance percentage to allow for a small loss of funds before entering the loss mode.
