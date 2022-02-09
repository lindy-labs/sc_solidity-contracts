// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IDCA} from "./IDCA.sol";

/**
 * Utility functions to only allow period execution of specific functions in a contract
 */
abstract contract DCAScheduler is IDCA {
    uint256 period;
    uint256 lastRunAt;

    // TODO event for when period changes

    constructor(uint256 _period) {
        _setPeriod(_period);
    }

    /**
     * Only allows a function to run after enough time has passed since the previous run
     */
    modifier onlyAfterPeriod() {
        require(
            lastRunAt == 0 || block.timestamp >= lastRunAt + period,
            "DCAScheduler: not enough time passed"
        );
        lastRunAt = block.timestamp;

        _;
    }

    /**
     * Internal function to change the existing period set
     */
    function _setPeriod(uint256 _period) internal {
        require(_period >= 30 days, "DCAScheduler: period too small");

        period = _period;
    }
}
