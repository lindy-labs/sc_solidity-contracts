# Sandclock System Properties

This file outlines the properties being tested using echidna.

## Arithmetic

Invoking Vault.deposit() with valid parameters always succeeds with
 - vault total underlying balance increasing with deposit amount
 - user balance decreasing with deposit amount
 - total shares of vault increasing with deposit amount multiplied with shares multiplier.
 - total principal of vault increasing with deposit amount

Invoking Vault.deposit() with invalid parameters always revert, ie when
 - deposit amount equals zero
 - claim percentage is zero
 - lock duration is less than 2 weeks
 - lock duration is more than 24 weeks
 - claim percentages do not add up to 100 percent
 - claim percentages more than 100 percent
 - input token is not supported, ie no swap pool

Invoking Vault.withdraw() with valid parameters always succeeds with
 - vault total underlying balance decreasing with withdraw amount
 - user balance increasing with withdraw amount
 - total shares of vault decreasing with amount multiplied with shares multiplier.
 - total principal of vault decreasing with deposit amount

Invoking Vault.withdraw() with invalid parameters always revert, ie when
 - lock duration has not passed yet
 - user has not made a deposit and user try to withdraw more than zero


## Access Control

Invoking strategy function invest, finishDepositstable and initRedeemstable always revert if caller is not manager.