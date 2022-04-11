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
     * Applies an estimated fee to the given @param _amount.
     *
     * This function should be used to estimate how much underlying will be
     * left after the strategy invests. For instance, the fees taken by Anchor
     * and Curve.
     *
     * @param _amount Amount to apply the fees to.
     *
     * @return Amount with the fees applied.
     */
    function applyInvestmentFee(uint256 _amount)
        external
        view
        returns (uint256);

    /**
     * Initiates the process of investing the underlying currency
     */
    function invest() external;
}
