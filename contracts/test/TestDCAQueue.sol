// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {DCAQueue} from "../integrations/DCA/DCAQueue.sol";

contract TestDCAQueue is DCAQueue {
    constructor(address _vault) DCAQueue(_vault) {}

    function input() external pure returns (address) {
        return address(0);
    }

    function output() external pure returns (address) {
        return address(0);
    }

    function getAccount(address addr)
        external
        view
        returns (
            uint256 reserved,
            uint256 positionsFirst,
            uint256 positionsLength
        )
    {
        Account storage account = accounts[addr];

        return (
            account.reserved,
            account.positions.first,
            account.positions.length
        );
    }

    function test_addPurchase(uint256 amountBought) external {
        purchases.push(Purchase(amountBought, totalShares));
    }

    function test_claimFromVault() external {
        _claimFromVault();
    }

    function executeSwap(uint256 _amountOutMin, uint256 _deadline) external {}
}
