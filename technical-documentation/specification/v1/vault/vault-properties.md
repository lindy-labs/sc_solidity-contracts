# Vault Properties

## Sandclock System Properties

This file outlines the properties tested using Echidna, as well as properties that have been formally verified. Because proof by contradiction is usually sufficient, negative properties will not be formally verified. On the other hand, Echidna was used on every property.

### Arithmetic

Invoking Vault.deposit() with valid parameters always succeeds when

| Property                                                                                   | Echidna | Formally Verified |
| ------------------------------------------------------------------------------------------ | :-----: | :---------------: |
| vault total underlying balance increases by the amount deposited                           |    ✓    |         ✓         |
| user balance decreases by the amount deposited                                             |    ✓    |         ✓         |
| total shares of the vault increase by the amount deposited multiplied by shares multiplier |    ✓    |         ✓         |
| total principal of the vault increases by the amount deposited                             |    ✓    |         ✓         |

Invoking Vault.deposit() with invalid parameters always reverts when

| Property                                           | Echidna | Formally Verified |
| -------------------------------------------------- | :-----: | :---------------: |
| deposit amount equals zero                         |    ✓    |         ✓         |
| claim percentage is zero                           |    ✓    |         ✓         |
| lock duration is less than the minimum timelock    |    ✓    |         ✓         |
| lock duration is greater than the maximum timelock |    ✓    |         ✓         |
| claim percentages do not add up to 100 percent     |    ✓    |         ✓         |
| claim percentages are greater than 100 percent     |    ✓    |         ✓         |
| input token is not supported                       |    ✓    |         ✓         |

Invoking Vault.sponsor() with valid parameters always succeeds when

| Property                                                         | Echidna | Formally Verified |
| ---------------------------------------------------------------- | :-----: | :---------------: |
| vault total underlying balance increases by the amount deposited |    ✓    |         ✓         |
| vault balance increases by the amount deposited                  |    ✓    |         ✓         |
| user balance decreases by the amount deposited                   |    ✓    |         ✓         |
| total shares of the vault remains unchanged                      |    ✓    |         ✓         |
| total principal of the vault remains unchanged                   |    ✓    |         ✓         |

Invoking Vault.sponsor() with invalid parameters always reverts when

| Property                                           | Echidna | Formally Verified |
| -------------------------------------------------- | :-----: | :---------------: |
| deposit amount equals zero                         |         |         ✓         |
| lock duration is less than the minimum timelock    |         |         ✓         |
| lock duration is greater than the maximum timelock |         |         ✓         |
| input token is not supported                       |         |         ✓         |

Invoking Vault.withdraw() with valid parameters always succeeds when

| Property                                                                                       | Echidna | Formally Verified |
| ---------------------------------------------------------------------------------------------- | :-----: | :---------------: |
| vault total underlying balance decreases by amount withdrawn                                   |    ✓    |         ✓         |
| user balance increases by the amount withdrawn                                                 |    ✓    |         ✓         |
| total shares of the vault decrease by the withdrawn amount multiplied by the shares multiplier |    ✓    |         ✓         |
| total principal of vault decreases by the amount deposited                                     |    ✓    |         ✓         |

Invoking Vault.withdraw() with invalid parameters always reverts when

| Property                                                         | Echidna | Formally Verified |
| ---------------------------------------------------------------- | :-----: | :---------------: |
| lock duration has not passed yet                                 |    ✓    |         ✓         |
| user has not made a deposit and tries to withdraw more than zero |    ✓    |         ✓         |

Invoking Vault.deposit() or Vault.withdraw() does not change price per share

| Property                             | Echidna | Formally Verified |
| ------------------------------------ | :-----: | :---------------: |
| deposits preserve price per share    |         |         ✓         |
| withdrawals preserve price per share |         |                   |

Invoking Vault.deposit() or Vault.withdraw() does not change the relation $$totalPrincipal == \sum deposits$$

| Property                                                | Echidna | Formally Verified |
| ------------------------------------------------------- | :-----: | :---------------: |
| deposits preserve $$totalPrincipal == \sum deposits$$   |         |         ✓         |
| withdrawals preserve $$totalPrincipal == \sum deposits$$|         |         ✓         |

### Access Control

| Property                                                                                                           | Echidna | Formally Verified |
| ------------------------------------------------------------------------------------------------------------------ | :-----: | :---------------: |
| invoking strategy function invest, finishDepositstable or initRedeemstable always reverts if caller is not manager |    ✓    |                   |
| invoking sponsor always reverts if caller does not have the SPONSOR\_ROLE                                          |         |         ✓         |
| invoking deposit or sponsor always reverts if vault is Paused                                                      |         |         ✓         |
| invoking withdraw, partialWithdraw, forceWithdraw or claimYield always reverts if vault is ExitPaused              |         |         ✓         |
| invoking unsponsor or partial Unsponsor always reverts if vault is ExitPaused                                      |         |         ✓         |
| invoking deposit always reverts if vault is in Loss Mode                                                           |         |         ✓         |
| invoking deposit or sponsor always succeeds when all preconditions are met                                         |         |         ✓         |
| invoking withdraw always reverts if vault is in Loss Mode                                                          |         |         ✓         |