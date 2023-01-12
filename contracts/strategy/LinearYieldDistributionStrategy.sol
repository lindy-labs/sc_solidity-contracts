// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {YieldDistributionStrategy} from "./YieldDistributionStrategy.sol";

abstract contract LinearYieldDistributionStrategy is YieldDistributionStrategy {
    constructor(uint256 _yieldCycleLength)
        YieldDistributionStrategy(_yieldCycleLength)
    {}

    function _calcYieldAmountDistributed(uint256 _endAmount, uint256 _timeDelta)
        internal
        view
        override(YieldDistributionStrategy)
        returns (uint256)
    {
        return
            _endAmount -
            (cycleDistributionAmount * (cycleLength - _timeDelta)) /
            cycleLength;
    }

    function _calcNewYieldAmountToDistribute(uint256 _timeDelta)
        internal
        view
        override(YieldDistributionStrategy)
        returns (uint256)
    {
        return (cycleDistributionAmount * _timeDelta) / cycleLength;
    }
}
