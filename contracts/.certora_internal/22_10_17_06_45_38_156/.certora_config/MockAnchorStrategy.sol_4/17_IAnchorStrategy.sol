// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Strategies can be plugged into vaults to invest and manage their underlying funds
 *
 * @notice It's up to the strategy to decide what do to with investable assets provided by a vault
 *
 * @notice It's up to the vault to decide how much to invest from the total pool
 */
interface IAnchorStrategy {
    //
    // Events
    //

    event InitDepositStable(
        address indexed operator,
        uint256 indexed idx,
        uint256 underlyingAmount,
        uint256 ustAmount
    );
    event FinishDepositStable(
        address indexed operator,
        uint256 ustAmount,
        uint256 aUstAmount
    );
    event RearrangeDepositOperation(
        address indexed operatorFrom,
        address indexed operatorTo,
        uint256 indexed newIdx
    );
    event InitRedeemStable(
        address indexed operator,
        uint256 indexed idx,
        uint256 aUstAmount
    );
    event FinishRedeemStable(
        address indexed operator,
        uint256 aUstAmount,
        uint256 ustAmount,
        uint256 underlyingAmount
    );
    event RearrangeRedeemOperation(
        address indexed operatorFrom,
        address indexed operatorTo,
        uint256 indexed newIdx
    );

    //
    // Structs
    //

    struct Operation {
        address operator;
        uint256 amount;
    }
}
