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
interface IStrategy {
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

    /**
     * The vault linked to this stragegy
     *
     * @return The vault's address
     */
    function vault() external view returns (address);

    /**
     * Withdraws all underlying back to vault.
     *
     * @notice If underlying is currently invested, this also starts the
     * cross-chain process to redeem it. After that is done, this function
     * should be called a second time to finish the withdrawal of that portion.
     */
    function withdrawAllToVault() external;

    /**
     * Withdraws a specified amount back to the vault
     *
     * @notice Unlike `withdrawToVault`, this function only considers the
     * amount currently not invested, but only what is currently held by the
     * strategy
     *
     * @param amount Amount to withdraw
     */
    function withdrawToVault(uint256 amount) external;

    /**
     * Amount, expressed in the underlying currency, currently in the strategy
     *
     * @notice both held and invested amounts are included here, using the
     * latest known exchange rates to the underlying currency
     *
     * @return The total amount of underlying
     */
    function investedAssets() external view returns (uint256);

    /**
     * Indicates if assets are invested into strategy or not.
     *
     * @notice this will be used when removing this strategy
     * @return true if assets invested, false if nothing invested.
     */
    function hasAssets() external view returns (bool);

    /**
     * Initiates a deposit of all the currently held UST into EthAnchor
     *
     * @notice since EthAnchor uses an asynchronous model, this function
     * only starts the deposit process, but does not finish it.
     * Each EthAnchor deposit is handled by a different operator, so we store
     * an operator address to finish later.
     * We need to increase pendingDeposits to track correct underlying assets.
     */
    function invest() external;
}
