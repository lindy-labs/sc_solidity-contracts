# Strategies

Each vault can only have one strategy, but any contract can be a strategy as long as it implements the required interface. We can replace the strategy at any moment by withdrawing all the funds to the vault, updating the address of the strategy, and rebalancing the vault.

Currently, there is one strategy built on Anchor and others built on top of a Yearn vault, Liquity, and Rysk. The strategy built on Anchor will not be deployed because the protocol crashed. However, it's kept as a reference implementation to ensure the vault would still work in a similar strategy.

Each strategy uses the same underlying as the contract it interacts with. For instance, when we deploy a strategy using Yearn’s LUSD Vault, our strategy will use LUSD (Liquity USD) as the underlying, and the same goes for our vault. However, the vault integrates with Curve to allow our users to deposit in different currencies. The underlying could be almost any other ERC20 stable coin.

Strategies can be synchronous or asynchronous, depending on whether their interactions can have an immediate effect. When withdrawing from a strategy, can the withdrawal request be fulfilled immediately? Or do we have to wait for it to be fulfilled later?

## **Synchronous strategies**

Our strategy built on Yearn is synchronous because we can withdraw our invested assets anytime and without delay. Each time the strategy invests into a Yearn vault, it receives wrapped ERC20 that accumulate value. When it’s time to withdraw, we exchange the wrapped ERC20 back into more (or less) of the original ERC20.

With a synchronous strategy, our vault can always fulfill an order, even when there aren’t enough funds in the reserves.

## **Asynchronous strategies**

An asynchronous strategy is not able to fulfill requests immediately. For instance, when withdrawing from Anchor, our strategy sends a withdrawal request that has to be fulfilled later by our backend or manually. Therefore, when there aren’t enough funds on the vault’s reserves to fulfill a withdrawal, the request will fail, and the users have to wait until the vault and strategy rebalance for more funds to be available.
