// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "./../MockExchange.sol";

import {IOracle} from "../../interfaces/opyn/IOracle.sol";

contract MockOracle is IOracle, MockExchange {
    function getHistoricalTwap(
        address _pool,
        address _base,
        address _quote,
        uint32 _period,
        uint32 _periodToHistoricPrice
    ) external view override returns (uint256) {}

    function getTwap(
        address, // _pool,
        address _base,
        address _quote,
        uint32, // _period,
        bool // _checkPeriod
    ) external view override returns (uint256) {
        return getExchangeRate(_base, _quote);
    }

    function getMaxPeriod(
        address _pool
    ) external view override returns (uint32) {}

    function getTimeWeightedAverageTickSafe(
        address _pool,
        uint32 _period
    ) external view override returns (int24 timeWeightedAverageTick) {}
}
