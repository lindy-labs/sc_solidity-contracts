// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "../interfaces/curve/ICurveExchange.sol";
import "./MockExchange.sol";

contract MockCurveExchange is ICurveExchange, MockExchange {
    function get_exchange_amount(
        address, /* _pool */
        address _from,
        address _to,
        uint256 _amount
    ) external view returns (uint256) {
        return (_amount * getExchangeRate(_from, _to)) / 1e18;
    }
}
