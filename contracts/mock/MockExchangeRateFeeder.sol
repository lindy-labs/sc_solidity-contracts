// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "./anchor/IExchangeRateFeeder.sol";

contract MockExchangeRateFeeder is IExchangeRateFeeder {
    uint256 internal exchangeRate;

    function setExchangeRate(uint256 _exchangeRate) external {
        exchangeRate = _exchangeRate;
    }

    function exchangeRateOf(address, bool)
        external
        view
        override(IExchangeRateFeeder)
        returns (uint256)
    {
        return exchangeRate;
    }
}
