// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {Weights} from "../Weights.sol";

contract Echidna_Weights is Weights {
    // using EnumerableSet for EnumerableSet.AddressSet;
    // EnumerableSet.AddressSet claimers;
    // function generateYield(uint8 _amount) public {
    //     require(balance > 0);
    //     require(_amount > 0);
    //     balance += uint256(_amount);
    // }
    // function loseYield(uint8 _amount) public {
    //     require(_amount > 0);
    //     require(_amount < balance);
    //     balance -= uint256(_amount);
    // }
    // function claimYieldForAll() public {
    //     for (uint256 i = 0; i < claimers.length(); i++) {
    //         this.claimYield(claimers.at(i));
    //     }
    // }
    // function withdrawableAmount(uint256 _id) internal view returns (uint256) {
    //     if (_id >= totalDeposits) {
    //         return 0;
    //     }
    //     address claimer = deposits[_id].claimer;
    //     uint256 depositInitialShares = deposits[_id].shares;
    //     uint256 depositAmount = deposits[_id].amount;
    //     uint256 claimerShares = claims[claimer].totalShares;
    //     uint256 claimerPrincipal = claims[claimer].totalPrincipal;
    //     uint256 _totalShares = totalShares;
    //     uint256 _balance = balance;
    //     uint256 depositShares = _computeShares(
    //         depositAmount,
    //         _totalShares,
    //         _balance
    //     );
    //     bool lostMoney = depositShares > depositInitialShares ||
    //         depositShares > claimerShares;
    //     if (lostMoney) {
    //         depositShares = (depositAmount * claimerShares) / claimerPrincipal;
    //     }
    //     return _computeAmount(depositShares, _totalShares, balance);
    // }
    // function echidna_depositsAndYieldEqualsBalance() public returns (bool) {
    //     uint256 sponsoredAmount;
    //     uint256 expectedBalance;
    //     for (uint256 i = 0; i < claimers.length(); i++) {
    //         expectedBalance += this.yieldFor(claimers.at(i));
    //     }
    //     for (uint256 i = 0; i < totalDeposits; i++) {
    //         if (deposits[i].sponsor) {
    //             sponsoredAmount += this.sponsoredAmount(i);
    //         } else {
    //             expectedBalance += withdrawableAmount(i);
    //         }
    //     }
    //     return int256(expectedBalance) - int256(balance) <= 5;
    // }
}
