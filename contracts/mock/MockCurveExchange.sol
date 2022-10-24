// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "../interfaces/curve/ICurveExchange.sol";
import "./MockExchange.sol";

import "hardhat/console.sol";

contract MockCurveExchange is ICurveExchange, MockExchange {
    constructor(address[] memory _tokens) MockExchange(_tokens) {}

    function get_exchange_amount(
        address, /* _pool */
        address _from,
        address _to,
        uint256 _amount
    ) external view returns (uint256) {
        // console.log(_from);
        // console.log(_to);
        // console.log(_amount);

        return (_amount * getExchangeRate(_from, _to)) / 1e18;
    }
}
