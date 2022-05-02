// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

library Errors {
    // Vault: invalid investPct
    string public constant VAULT_INVALID_INVESTPCT = "Vault: invalid investPct";

    // Vault: invalid performance fee
    string public constant VAULT_INVALID_PERFORMANCE_FEE = "Vault: invalid performance fee";

    // Vault: no performance fee
    string public constant VAULT_NO_PERFORMANCE_FEE = "Vault: no performance fee";

    // Vault: invalid investment fee
    string public constant VAULT_INVALID_INVESTMENT_FEE = "Vault: invalid investment fee";

    // Vault: underlying cannot be 0x0
    string public constant VAULT_UNDERLYING_CANNOT_BE_0_ADDRESS = "Vault: underlying cannot be 0x0";

    // Vault: treasury cannot be 0x0
    string public constant VAULT_TREASURY_CANNOT_BE_0_ADDRESS = "Vault: treasury cannot be 0x0";

    // Vault: owner cannot be 0x0
    string public constant VAULT_OWNER_CANNOT_BE_0_ADDRESS = "Vault: owner cannot be 0x0";

    // Vault: destination address is 0x
    string public constant VAULT_DESTINATION_CANNOT_BE_0_ADDRESS = "Vault: destination address is 0x";

    // Vault: strategy is not set
    string public constant VAULT_STRATEGY_NOT_SET = "Vault: strategy is not set";

    // Vault: invalid minLockPeriod
    string public constant VAULT_INVALID_MIN_LOCK_PERIOD = "Vault: invalid minLockPeriod";

    // Vault: invalid lock period
    string public constant VAULT_INVALID_LOCK_PERIOD = "Vault: invalid lock period";

    // Vault: cannot deposit 0
    string public constant VAULT_CANNOT_DEPOSIT_0 = "Vault: cannot deposit 0";

    // Vault: cannot sponsor 0
    string public constant VAULT_CANNOT_SPONSOR_0 = "Vault: cannot sponsor 0";

    // Vault: cannot deposit when yield is negative
    string public constant VAULT_CANNOT_DEPOSIT_WHEN_YIELD_NEGATIVE = "Vault: cannot deposit when yield is negative";

    // Vault: nothing to do
    string public constant VAULT_NOTHING_TO_DO = "Vault: nothing to do";

    // Vault: invalid vault
    string public constant VAULT_INVALID_VAULT = "Vault: invalid vault";

    // Vault: strategy has invested funds
    string public constant VAULT_STRATEGY_HAS_INVESTED_FUNDS = "Vault: strategy has invested funds";

    // Vault: not enough funds
    string public constant VAULT_NOT_ENOUGH_FUNDS = "Vault: not enough funds";

    // Vault: amount too large
    string public constant VAULT_AMOUNT_TOO_LARGE = "Vault: amount too large";

    // Vault: you are not allowed
    string public constant VAULT_NOT_ALLOWED = "Vault: you are not allowed";

    // Vault: amount is locked
    string public constant VAULT_AMOUNT_LOCKED = "Vault: amount is locked";

    // Vault: deposit is locked
    string public constant VAULT_DEPOSIT_LOCKED = "Vault: deposit is locked";

    // Vault: token id is not a sponsor
    string public constant VAULT_NOT_SPONSOR = "Vault: token id is not a sponsor";

    // Vault: token id is not a deposit
    string public constant VAULT_NOT_DEPOSIT = "Vault: token id is not a deposit";

    // Vault: claim percentage cannot be 0
    string public constant VAULT_CLAIM_PERCENTAGE_CANNOT_BE_0 = "Vault: claim percentage cannot be 0";

    // Vault: claims don't add up to 100%
    string public constant VAULT_CLAIMS_DONT_ADD_UP = "Vault: claims don't add up to 100%";

    // Vault: you are not the owner of a deposit
    string public constant VAULT_NOT_OWNER_OF_DEPOSIT = "Vault: you are not the owner of a deposit";

    // Vault: cannot withdraw more than the available amount
    string public constant VAULT_CANNOT_WITHDRAW_MORE_THAN_AVAILABLE = "Vault: cannot withdraw more than the available amount";

    // Vault: amount received does not match params
    string public constant VAULT_AMOUNT_DOES_NOT_MATCH_PARAMS = "Vault: amount received does not match params";

    // Vault: cannot compute shares when there's no principal
    string public constant VAULT_CANNOT_COMPUTE_SHARES_WITHOUT_PRINCIPAL = "Vault: cannot compute shares when there's no principal";
}
