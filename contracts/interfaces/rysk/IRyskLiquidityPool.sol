// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Describes the interface used to communicate with the Rysk LiquidityPool contract.
 *
 */
interface IRyskLiquidityPool is IERC20 {
    /**
     * Gets the current deposit epoch.
     *
     * @notice Deposit epochs represent time resolution on which the pool handles deposits.
     * For every new deposit epoch a new deposit price per share is calculated.
     * Deposits are initiated in one epoch and completed during epoch calculation by
     * minting appropriate amout of pool shares for that deposit, calculated as amount/pps.
     *
     * @notice Expected duration for an epoch is around 1 week at the moment.
     *
     * @return the current deposit epoch
     */
    function depositEpoch() external view returns (uint256);

    /**
     * Gets the current withdrawal epoch.
     *
     * @notice Epochs represent time resolution on which the pool handles withdrawals.
     * For every new withdrawal epoch a new withdrawal price per share is calculated.
     * Withdrawals are initiated in one epoch and completed in another.
     *
     * @notice Expected duration for an epoch is around 1 week at the moment.
     *
     * @return the current withdrawal epoch
     */
    function withdrawalEpoch() external view returns (uint256);

    /**
     * Gets the price per share for the requrested deposit epoch.
     *
     * @param _epoch the deposit epoch
     *
     * @return the price per share at the requested deposit epoch
     */
    function depositEpochPricePerShare(uint256 _epoch)
        external
        view
        returns (uint256);

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
     * On sucessful deposit, deposit receipt is created containing only the amount deposited, no unredeemed shares.
     * Only when a new deposit epoch is initiated, corresponding number of shares is minted. Shares minted are not
     * immediately transferred to the caller and they will not show in the call to balanceOf() function on the pool.
     * Those shares will become unreddemed on the next deposit call and that will be reflected on the deposit receipt.
     * All shares will be redeemed on the next call to initiateWithdrawal or redeem functions.
     *
     * @return true if the deposit was successful
     */
    function deposit(uint256 _amount) external returns (bool);

    /**
     * Redeems the specified amount of shares from the pool.
     *
     * @notice A depositor is entitled to a certain amount of shares for his deposit, which are not being minted upon depositing.
     * Shares are actually being minted asynchronously, when the liquidity pool enters a new deposit epoch.
     * Newly minted shares are not owned by the depositor immediately, instead they are owned by the pool itself when minted.
     * For the depositor to claim his shares, it is required for him to interact with the pool. For example, when making a new deposit,
     * unredemed shares from the previous epoch are added to the deposit receipt as unredeemed shares. When initiating a withdrawal,
     * all unredeemed shares will be redeemed, deposit receipt fields (amount and unredeemed shares) are reset and those shares
     * are now counted in the return value of the balanceOf() function on the pool.
     *
     * @param _shares amount of shares to redeem
     *
     * @return amount of shares actually redeemed
     */
    function redeem(uint256 _shares) external returns (uint256);

    /**
     * Initiates a withdrawal in amount of shares from the pool.
     *
     * @notice This is the first part of the asynchronous withdrawal operation.
     * Unredeemed shares are transferred (redeemed) to the caller and withdrawal receipt is created for the current withdrawal epoch.
     * To actually withdraw the funds, the caller must execute completeWithdrawal function in another withdrawal epoch.
     *
     * @notice Multiple calls in the same epoch will aggregate the shares to withdraw in the withdrawal receipt.
     * Calling this method in a later withdrawal epoch will revert if the previously initiated withdrawal wasn't completed.
     *
     * @param _shares the amount of shares to withdraw
     */
    function initiateWithdraw(uint256 _shares) external;

    /**
     * Completes the withdrawal operation.
     *
     * @notice This is the second part of the asynchronous withdrawal operation.
     * Shares are converted to underlying currency and transferred to the caller, using price per share for the withdrawal epoch.
     * initiateWithdrawal and completeWithdrawal cannot be called in the same epoch.
     * On success, the withdrawal receipt is updated, shares are burned and the caller receives the underlying assets.
     *
     * @param _shares the amount of shares to withdraw.
     * Can be less than the amount of shares in the withdrawal receipt but that will not complete the initiated withdrawal.
     */
    function completeWithdraw(uint256 _shares) external returns (uint256);

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
        uint256 unredeemedShares; // 18 decimals
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
