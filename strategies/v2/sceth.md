---
cover: ../../.gitbook/assets/IMG (1).jpg
coverY: 0
layout:
  cover:
    visible: true
    size: full
  title:
    visible: true
  description:
    visible: true
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: true
---

# scETH

**Deposit Token : **_**WETH or ETH**_

_Welcome to scETH's strategy guide! We've designed a smart way to help you get more from your Ethereum (ETH) deposits. This guide will walk you through how it all works, why it's efficient, and what you should know about potential risks._

### **Introduction**

This strategy is designed to maximize returns on ETH deposits by leveraging staking and lending mechanisms.

It leverages the supplied WETH using flashloans, stakes the leveraged eth, supplies the wstETH as collateral and subsequently borrows weth on that collateral to payback the flashloan. The bulk of the interest is earned from staking the leveraged ETH and rest from supplying wstETH collateral. Instead of being limited to just one pre coded lending market, this strategy can use mulitple lending markets thus introducing greater flexibility, better APYs and lower risk for the investments.

<figure><img src="../../.gitbook/assets/IMG (1).jpg" alt=""><figcaption></figcaption></figure>

### **How it works**

1. Suppose the strategy aims for a 3x leverage on the deposited ETH.
2. It will first flashloan an amount equivalent to twice the deposited ETH from Balancer (at zero fees).
3. Stake all this ETH with Lido, generating 3x Lido staking interest, and receive stETH tokens in return.
4. Wrap the stETH tokens to get wstETH.
5. Supply these wstETH tokens as collateral to platforms like AAVEV3, CompoundV3, Morpho, or other lending protocols. Here, we are earning the supply interest too.
6. Borrow ETH from the lending protocol to payback the flashloan.
7. Pay back the flashloan and end the transaction.

### **Dynamic Asset Allocation**

As you can see from the above steps, the lending protocol where we supply the collateral and borrow is of immense importance. Since, we would have to pay the borrow interest it is very important to only borrow from lending protocols with the least borrow interest and highest supply interest. So, we made our strategies as flexible as possible for this.

The allocations for the lending protocols are not hardcoded into the contract but are calculated realtime for each invest by our backend allocation calculation algorithm. The algorithm outputs the optimum allocations to lending protocols depending on the invest amount and supply/borrow interests. And the strategy just invests to those lending protocols based on those output allocations.

In certain market conditions, the strategy might opt for simple staking on Lido, ensuring the highest APYs regardless of market dynamics.

### **ERC20**

scETH inherits the [ERC4626](https://ethereum.org/en/developers/docs/standards/tokens/erc-4626/) standard for creating Vaults, so depositing to the vault will earn you scETH ERC20 tokens based on the amount you deposited and the total assets already deposited in the vault. You can use these scETH ERC20 tokens in any way you would use any normal ERC20 token, such as adding liquidity in decentralized exchanges, transferring to other users, etc.

### **Gas Efficiency**

This is one of our most gas efficient Vaults for user deposits and withdrawals. For WETH deposits (supposing the current gas price is 10 gwei) the user will only need to spend 0.0006 ETH in gas for any amount of WETH deposited.

And for withdrawals, the user will only need to spend 0.00053 ETH in gas if the withdrawal amount is less than 1 WETH. We achieve this by always maintaining a float amount of 1 WETH in the vault to ease the gas pockets of users with small withdrawals.

### **Best Time to use strategy ?**

The best time to use this strategy is if you are HODLING ETH. If you are planning to HODL ETH into the bull market, then deposit your ETH in this vault and earn juicy enhanced yields on your ETH.

### **Risks**

_Smart Contract Risk_ : Despite extensive testing and audits by Trail of Bits, there's always a residual risk of a smart contract breach.

_Admin getting compromised_ : Our admin operates behind a 3 of 5 signatures multisig, minimizing the risk. However, any compromise could be detrimental.. (There is a keeper address which runs the backend scripts, but the keeper has no special access to affect the funds in any way other than just to invest or disinvest funds, so the keeper being compromised poses no risk to the funds in the Vault).

_Liquidation Risk_ : Borrowing WETH against wstETH poses a liquidation risk if there's a significant price deviation between them. However, WETH and wstETH are correlated assets, minimizing this risk. We also have 24/7 monitoring for price deviations exceeding 1-3%, with measures in place to prevent liquidation.

### **Audits**

[Audited by Trail of Bits.](https://github.com/trailofbits/publications/blob/master/reviews/2023-07-sandclock-securityreview.pdf)
