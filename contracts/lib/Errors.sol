// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

library Errors {
    //
    // Vault Errors
    //

    // Vault: invalid investPct
    string public constant VAULT_INVALID_INVESTPCT = "0";

    // Vault: invalid performance fee
    string public constant VAULT_INVALID_PERFORMANCE_FEE = "1";

    // Vault: no performance fee
    string public constant VAULT_NO_PERFORMANCE_FEE = "2";

    // Vault: invalid investment fee
    string public constant VAULT_INVALID_INVESTMENT_FEE = "3";

    // Vault: underlying cannot be 0x0
    string public constant VAULT_UNDERLYING_CANNOT_BE_0_ADDRESS = "4";

    // Vault: treasury cannot be 0x0
    string public constant VAULT_TREASURY_CANNOT_BE_0_ADDRESS = "5";

    // Vault: owner cannot be 0x0
    string public constant VAULT_OWNER_CANNOT_BE_0_ADDRESS = "6";

    // Vault: destination address is 0x
    string public constant VAULT_DESTINATION_CANNOT_BE_0_ADDRESS = "7";

    // Vault: strategy is not set
    string public constant VAULT_STRATEGY_NOT_SET = "8";

    // Vault: invalid minLockPeriod
    string public constant VAULT_INVALID_MIN_LOCK_PERIOD = "9";

    // Vault: invalid lock period
    string public constant VAULT_INVALID_LOCK_PERIOD = "a";

    // Vault: cannot deposit 0
    string public constant VAULT_CANNOT_DEPOSIT_0 = "b";

    // Vault: cannot sponsor 0
    string public constant VAULT_CANNOT_SPONSOR_0 = "c";

    // Vault: cannot deposit when yield is negative
    string public constant VAULT_CANNOT_DEPOSIT_WHEN_YIELD_NEGATIVE = "d";

    // Vault: nothing to do
    string public constant VAULT_NOTHING_TO_DO = "e";

    // Vault: invalid vault
    string public constant VAULT_INVALID_VAULT = "f";

    // Vault: strategy has invested funds
    string public constant VAULT_STRATEGY_HAS_INVESTED_FUNDS = "10";

    // Vault: not enough funds
    string public constant VAULT_NOT_ENOUGH_FUNDS = "11";

    // Vault: amount too large
    string public constant VAULT_AMOUNT_TOO_LARGE = "12";

    // Vault: you are not allowed
    string public constant VAULT_NOT_ALLOWED = "13";

    // Vault: amount is locked
    string public constant VAULT_AMOUNT_LOCKED = "14";

    // Vault: deposit is locked
    string public constant VAULT_DEPOSIT_LOCKED = "15";

    // Vault: token id is not a sponsor
    string public constant VAULT_NOT_SPONSOR = "16";

    // Vault: token id is not a deposit
    string public constant VAULT_NOT_DEPOSIT = "17";

    // Vault: claim percentage cannot be 0
    string public constant VAULT_CLAIM_PERCENTAGE_CANNOT_BE_0 = "18";

    // Vault: claims don't add up to 100%
    string public constant VAULT_CLAIMS_DONT_ADD_UP = "19";

    // Vault: you are not the owner of a deposit
    string public constant VAULT_NOT_OWNER_OF_DEPOSIT = "1a";

    // Vault: cannot withdraw more than the available amount
    string public constant VAULT_CANNOT_WITHDRAW_MORE_THAN_AVAILABLE = "1b";

    // Vault: amount received does not match params
    string public constant VAULT_AMOUNT_DOES_NOT_MATCH_PARAMS = "1c";

    // Vault: cannot compute shares when there's no principal
    string public constant VAULT_CANNOT_COMPUTE_SHARES_WITHOUT_PRINCIPAL = "1d";

    //
    // Strategy Errors
    //

    // AnchorStrategy: owner is 0x
    string public constant STRATEGY_OWNER_CANNOT_BE_0_ADDRESS = "30";

    // AnchorStrategy: router is 0x
    string public constant STRATEGY_ROUTER_CANNOT_BE_0_ADDRESS = "31";

    // AnchorStrategy: ust is 0x
    string public constant STRATEGY_UNDERLYING_CANNOT_BE_0_ADDRESS = "32";

    // AnchorStrategy: aUST is 0x
    string public constant STRATEGY_YIELD_TOKEN_CANNOT_BE_0_ADDRESS = "33";

    // AnchorStrategy: not an IVault
    string public constant STRATEGY_NOT_IVAULT = "34";

    // AnchorStrategy: caller is not manager
    string public constant STRATEGY_CALLER_NOT_MANAGER = "35";

    // AnchorStrategy: amount is 0
    string public constant STRATEGY_AMOUNT_ZERO = "36";

    // AnchorStrategy: no ust exist
    string public constant STRATEGY_NO_UST = "37";

    // AnchorStrategy: not running
    string public constant STRATEGY_NOT_RUNNING = "38";

    // AnchorStrategy: no aUST returned
    string public constant STRATEGY_NO_AUST_RETURNED = "39";

    // AnchorStrategy: nothing redeemed
    string public constant STRATEGY_NOTHING_REDEEMED = "40";

    // AnchorStrategy: invalid aUST rate
    string public constant STRATEGY_INVALID_AUST_RATE = "4a";
}
