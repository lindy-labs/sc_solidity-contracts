# Sandclock System Properties

This file outlines the properties being tested using echidna.

## Arithmetic

Invoking Vault.deposit() with valid parameters always succeeds, when
 - the vault total underlying balance increases by the amount deposited
 - the user balance decreases by the amount deposited
 - the total shares of the vault increase by the amount deposited multiplied by shares multiplier.
 - the total principal of the vault increases by the amount deposited

Invoking Vault.deposit() with invalid parameters always reverts, when
 - the deposit amount equals zero
 - the claim percentage is zero
 - the lock duration is less than the minimum timelock
 - the lock duration is greater than the maximum timelock
 - the claim percentages do not add up to 100 percent
 - the claim percentages are greater than 100 percent
 - the input token is not supported

Invoking Vault.sponsor() with valid parameters always succeeds, when
 - vault total underlying balance increases by the amount sponsored
 - user balance decreases by the amount sponsored
 - the total shares of the vault increase by the amount sponsored multiplied by the shares multiplier.
 - the total principal of vault increases by the amount sponsored

Invoking Vault.sponsor() with invalid parameters always reverts, when
 - the sponsor amount equals zero
 - the lock duration is less than the minimum timelock
 - the lock duration is greater than the maximum timelock
 - the claim percentages do not add up to 100 percent
 - the claim percentages are greater than 100 percent
 - the input token is not supported

Invoking Vault.withdraw() with valid parameters always succeeds, when
 - the vault total underlying balance decreases by amount withdrawn
 - the user balance increases by the amount withdrawn
 - the total shares of the vault decrease by the withdrawn amount multiplied by the shares multiplier.
 - the total principal of vault decreases by the amount deposited

Invoking Vault.withdraw() with invalid parameters always reverts, when
 - the lock duration has not passed yet
 - the user has not made a deposit and tries to withdraw more than zero

## Access Control

Invoking strategy function invest, finishDepositstable or initRedeemstable always revert if caller is not manager.

Invoking sponsor always reverts if caller does not have the SPONSOR_ROLE.

Invoking deposit or sponsor always revert if vault is Paused.

Invoking withdraw or claimYield always revert if vault is ExitPaused.
