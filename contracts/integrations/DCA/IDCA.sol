// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IIntegration} from "../IIntegration.sol";

interface IDCA is IIntegration {
    //
    // Events
    //

    event Withdrawn(address indexed beneficiary, uint256 amount);

    event SharesMinted(address indexed beneficiary, uint256 shares);

    event SharesBurned(address indexed beneficiary, uint256 shares);

    event SwapExecuted(
        uint256 indexed purchaseIndex,
        uint256 amountIn,
        uint256 amountOut
    );

    //
    // Public API
    //

    /**
     * The vault linked to this DCA
     */
    function vault() external view returns (address);

    /**
     * The underlying token that will be used
     */
    function input() external view returns (address);

    /**
     * The token to invest in
     */
    function output() external view returns (address);

    /**
     * Withdraws all the amount due to an account
     */
    function withdraw() external;

    /**
     * Computes total amount due to an account, for all the purchases he had shares in
     *
     * @param _beneficiary Account to check the balance of
     */
    function balanceOf(address _beneficiary) external view returns (uint256);

    /**
     * Executes a periodic purchase
     *
     * @param _amountOutMin minimum expected amount of output token
     */
    function executeSwap(uint256 _amountOutMin, uint256 _deadline) external;
}
