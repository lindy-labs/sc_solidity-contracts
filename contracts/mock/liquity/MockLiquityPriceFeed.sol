// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "../../interfaces/liquity/IPriceFeed.sol";

contract MockLiquityPriceFeed is IPriceFeed {
    string constant public NAME = "PriceFeed";

    // The last good price seen from an oracle by Liquity
    uint public lastGoodPrice;

    // --- Dependency setters ---

    function fetchPrice() external view override returns (uint) {
        return lastGoodPrice;
    }

    function setPrice(uint price) external {
        lastGoodPrice = price;

        emit LastGoodPriceUpdated(lastGoodPrice);
    }
}
