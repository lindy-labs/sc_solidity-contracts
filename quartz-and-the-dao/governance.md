# Governance

Sandclock is a community owned project, governed by QUARTZ token holders.

## Road to Decentralization

As with every reputable protocol, Sandclock has had a plan to decentralize from day 1. However, the path to decentralization must be a gradual process in order to ensure the long term success and resilience of the protocol. Our plan features three stages: **Snapshot → SafeSnap → DAO.**

### **Snapshot**

Initially Snapshot will be used. Snapshot does not allow for trustless on-chain execution of off-chain votes.

### SafeSnap

SafeSnap combines Snapshot and Gnosis Safe to enable trustless on-chain execution of off-chain votes. This makes SafeSnap a very good decentralization solution for Sandclock, and one that could in theory be used for a long time.

Once launched, we will have the current multisig as a safeguard. Thus, on-chain execution of off-chain votes is handled by the SafeSnap module, but there are still multisig owners that can veto malicious actions or act quickly in the case of an emergency. &#x20;

### DAO

The DAO itself represents the pinnacle of trustlessness and decentralization. Our particular DAO, developed from scratch, comes with,

* **Liquid Democracy.** Liquid democracy is a subset of delegative democracy whereby an electorate has the option of vesting voting power in delegates, as well as voting directly themselves. Too busy to vote? Delegate your votes. [Charity mining depends upon this feature.](allocation.md#charity-mining-permalocked-tokens)
* **Conviction Voting.** Conviction Voting is a fairer, novel continuous decision making alternative to current governance mechanisms. To put it simply, the longer the stake, the stronger your conviction and thus, your voting power, for better or for worse. We have modified the contract to support negative conviction and enable PvP mechanics! Read more about conviction voting [here](https://medium.com/commonsstack/conviction-voting-a-novel-continuous-decision-making-alternative-to-governance-62e215ad2b3d).

## Governable Actions & Params

* **Timelock**

A timelock is applied to every deposit in order to mitigate certain economic exploits. Once the DAO has been deployed, it will be configurable by QUARTZ holders. Until then, every strategy deployed will have a very low timelock.

* **Performance Fee**

The performance fee is charged on top of the yield generated. It is owned by QUARTZ holders and varies per strategy.

* **Treasury Management**

Tokens in the treasury can be deployed in order to boost the growth of our ecosystem, at the discretion of QUARTZ holders.

* **Strategy Upgrades**

A given vault's strategy contract may be switched out. In order to do so safely we enforce a few conditions. One, the strategy contract must be empty. Two, the function call must come from a specific `ROLE`. This `ROLE` will be assigned to the DAO as soon as possible.

* **Contract Pausing via pause() or exitPause()**

The contracts functions can be paused for a certain amount of time per function call, as part of an emergency. The function call must come from a specific `ROLE`. This `ROLE` will be assigned to the DAO, or a group elected by the DAO as soon as possible.

* **Non-technical Proposals**

A non-technical proposal is any proposal without a low level specification. An example of such a proposal would be to add a `rageQuit()` function to QUARTZ in order to modify its value accrual mechanisms. Another example would be a marketing proposal, or deploying to another chain.

##
