// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "../../interfaces/liquity/IPriceFeed.sol";

contract MockLiquityPriceFeed is IPriceFeed {
    string constant public NAME = "PriceFeed";

    uint public lastGoodPrice;

    function fetchPrice() external view override returns (uint) {
        return lastGoodPrice;
    }

    function setPrice(uint price) external {
        lastGoodPrice = price;

        emit LastGoodPriceUpdated(lastGoodPrice);
    }
}
