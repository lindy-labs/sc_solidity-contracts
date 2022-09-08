// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Describes the interface used to communicate with the Rysk LiquidityPool contract.
 *
 */
interface IRyskLiquidityPool is IERC20 {
    /**
     * Gets the current withdrawal epoch.
     *
     * @notice Epochs represent time resolution on which the pool operates.
     * For every epoch a new price per share is calculated and pool rebalances.
     * Withdrawals are initiated in one epoch and completed in some later epoch.
     * There are two epoch types, deposit and withdrawal epochs.
     *
     * @return the current withdrawal epoch
     */
    function withdrawalEpoch() external view returns (uint256);

    /**
     * Gets the price per share for the requrested withdrawal epoch.
     *
     * @param _epoch the withdrawal epoch
     *
     * @return the price per share at the requested withdrawal epoch
     */
    function withdrawalEpochPricePerShare(uint256 _epoch)
        external
        view
        returns (uint256);

    /**
     * Deposits the specified amount of underlying currency into the pool.
     *
     * @notice The amount of underlying currency deposited is converted to shares.
     * On sucessful deposit, deposit receipt is created containing the amount of unredeemed shares.
     * Only when a new deposit epoch is initiated, those shares are minted but
     * ownership of the shares is not transferred to the caller (unredeemed shares).
     * Shares will be redeemed on the next initiateWithdrawal call.
     *
     * @return true if the deposit was successful
     */
    function deposit(uint256 _amount) external returns (bool);

    /**
     * Gets the deposit receipt for the requrested user.
     *
     * @notice Deposit receipts are created when a user deposits funds
     *
     * @return the deposit receipt
     */
    function depositReceipts(address _user)
        external
        view
        returns (DepositReceipt memory);

    /**
     * Initiates a withdrawal in amount of shares from the pool.
     *
     * @notice This is the first part of the asynchronous withdrawal operation.
     * Unredeemed shares are transferred (redeemed) to the caller and withdrawal receipt is created for the current withdrawal epoch.
     * To actually withdraw the funds, the completeWithdrawal must be called.
     *
     * @notice Multiple calls in the same epoch will aggregate the shares to withdraw in the withdrawal receipt.
     * Calling this method in a later withdrawal epoch will revert, assuming the initiated withdrawal isn't completed.
     *
     * @param _shares the amount of shares to withdraw
     */
    function initiateWithdraw(uint256 _shares) external;

    /**
     * Completes the withdrawal operation.
     *
     * @notice This is the second part of the asynchronous withdrawal operation.
     * Shares are converted to underlying currency and transferred to the caller, using price per share for the current withdrawal epoch.
     * initiateWithdrawal and completeWithdrawal cannot be called in the same epoch.
     * On success, the withdrawal receipt is updated, shares are burned and the caller receives the underlying currency.
     *
     * @param _shares the amount of shares to withdraw. Can be less than the amount of shares in the withdrawal receipt.
     */
    function completeWithdraw(uint256 _shares) external returns (uint256);

    /**
     * Gets the withdrawal receipt for the requrested user.
     *
     * @notice Withdrawal receipts are created when a user initiates a withdrawal.
     *
     * @return the withdrawal receipt
     */
    function withdrawalReceipts(address _user)
        external
        view
        returns (WithdrawalReceipt memory);

    //
    // Structs
    //

    /**
     * Describes the deposit receipt.
     */
    struct DepositReceipt {
        // epoch number when the deposit was made
        uint128 epoch;
        // amount of underlying currency deposited
        uint128 amount;
        // amount of shares minted by the pool, waiting to be redeemed
        uint256 unredeemedShares; // 18 decimals assumed
    }

    /**
     * Describes the withdrawal receipt.
     */
    struct WithdrawalReceipt {
        // epoch number when the withdrawal was initiated
        uint128 epoch;
        // max amount of shares intended for withdrawal
        uint128 shares; // 18 decimals assumed
    }
}
