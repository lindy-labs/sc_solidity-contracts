---
cover: ../../.gitbook/assets/strat.jpg
coverY: 0
---

# Opal (scUSDC)

_Welcome to **Sandclock Yield USDC (scUSDC)**, a cutting-edge financial strategy designed to generate consistent and compounded returns in USDC leveraging Ethereum staking._

## **Overview**

**scUSDC** is a sophisticated yield-generating strategy that is following the ERC4626 standard. Leveraging the power of Ethereum staking, this strategy aims to deliver consistent yield in USDC. To achieve this, scUSDC collaborates with another Sandclock strategy, [scETH](https://docs.sandclock.org/current/strategies/v2/emerald-sceth), while also utilizing a diverse range of lending markets such as AaveV3/V2 and Morpho, among potential future additions.

### **Mechanism**

Here's how the scUSDC strategy operates in a streamlined manner:

1. **Initial Deposit**: Users deposit USDC into the scUSDCv2 vault and are issued an equivalent amount of scUSDC shares.
2. **Loan Creation**: The strategy engages one or multiple lending markets, utilizing the USDC deposits to secure a loan in ETH.
3. **Yield Generation**: The borrowed ETH is allocated to the scETH strategy, thereby generating yield through leveraged Ethereum staking.
4. **Yield Conversion & Compounding**: The yield generated in ETH is converted back to USDC. The process is then iteratively repeated, leveraging steps 2 and 3, to compound interest.

### **Portfolio Rebalancing**

To maintain a healthy Loan-to-Value (LTV) ratio, the strategy employs a process known as "rebalancing." This is triggered when:

* The LTV deviates by 5% or more from the target.
* Additional new deposits are made into the strategy.
* The yield crosses a predetermined threshold.

### **Asset Allocation**

Our proprietary "allocation algorithm" ensures optimal asset allocation by dynamically interacting with multiple lending markets to secure the most favorable loan rates for USDC/ETH loans. This dynamic approach allows the strategy to take loans from various markets concurrently, not limiting it to a single source. Should the algorithm detect suboptimal rates, it initiates a "reallocation" process. Inefficient loans are swiftly settled using flash loans, and the collateral is moved to a lending market offering superior rates.

### **Gas Efficiency**

We prioritize gas efficiency at every step:

* **Deposits**: Minimal gas is required as it only involves minting scUSDC shares.
* **Withdrawals**: To minimize withdrawal gas costs, an amount equivalent to 1% of the total assets managed by the strategy is readily available for immediate withdrawals. Exceeding this limit may incur additional gas costs.

### **Risk Mitigation**

#### **Smart Contract Risk**

Despite undergoing rigorous testing and audits by Trail of Bits, it's important to acknowledge the residual risk associated with smart contract vulnerabilities.

#### **Liquidation Risk**

Borrowing ETH against USDC carries a liquidation risk, especially in volatile market conditions. To mitigate this, our backend system offers 24/7 monitoring that triggers an immediate rebalancing process if the LTV increases by 5%, thereby adjusting the loan amounts to align with target LTV values.

Invest wisely and leverage the power of scUSDC to optimize your yield generation in a secure and efficient manner.

### Audits

[Audited by Trail of Bits.](https://github.com/trailofbits/publications/blob/master/reviews/2023-07-sandclock-securityreview.pdf)
