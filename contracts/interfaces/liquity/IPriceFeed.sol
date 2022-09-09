// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

interface IPriceFeed {

    // --- Events ---
    event LastGoodPriceUpdated(uint _lastGoodPrice);

    // --- Function ---
    function fetchPrice() external returns (uint);
}
