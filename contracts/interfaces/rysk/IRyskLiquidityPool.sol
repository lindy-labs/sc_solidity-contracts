// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface IRyskLiquidityPool is IERC20 {
    function epoch() external view returns(uint256);

    function epochPricePerShare(uint256 _epoch) external view returns(uint256);

    function depositReceipts(address _user) external view returns(DepositReceipt memory);

    function withdrawalReceipts(address _user) external view returns(WithdrawalReceipt memory);

    // this can never return false
    function deposit(uint256 _amount) external returns (bool);
    //
    function initiateWithdraw(uint256 _shares) external;
    // 
    function completeWithdraw(uint256 _shares) external returns (uint256);
    
    // 
    // Structs
    //

	struct DepositReceipt {
		uint128 epoch;
		uint128 amount;
		uint256 unredeemedShares; // e18
	}

    struct WithdrawalReceipt {
        uint128 epoch;
        uint128 shares; // e18
    }
}