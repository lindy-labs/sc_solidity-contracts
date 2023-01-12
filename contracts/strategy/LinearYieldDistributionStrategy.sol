// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IStrategy} from "./IStrategy.sol";

import "hardhat/console.sol";

abstract contract LinearYieldDistributionStrategy is IStrategy {
    /**
     * Emmited when the yield distribution cycle is updated.
     *
     * @param startTimestamp the timestamp of the start of the current
     * yield distribution cycle.
     * @param distributionAmount the amount being distributed in the current cycle.
     * @param startAmount the sum of deposits and distributed yield in the
     * contract at the beginning of a cycle.
     */
    event StrategyYieldDistributionCycle(
        uint256 startTimestamp,
        uint256 distributionAmount,
        uint256 startAmount
    );

    // The length of a yield distribution cycle
    uint256 public cycleLength;
    // The amount being distributed in the yield distribution cycle
    uint256 public cycleDistributionAmount;
    // The timestamp of the start of the yield distribution cycle
    uint256 public cycleStartTimestamp;
    // The sum of deposits and distributed yield at the beginning of a cycle
    uint256 public cycleStartAmount;

    constructor(uint256 _yieldCycleLength) {
        // TODO: check if the yield cycle length is valid
        require(_yieldCycleLength > 0, "Yield cycle length cannot be 0");

        cycleLength = _yieldCycleLength;
    }

    // TODO: make dist cycle length configurable

    /// @inheritdoc IStrategy
    function investedAssets()
        public
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        uint256 totalInvestedAssets = _totalInvestedAssets();

        if ((cycleStartTimestamp == 0) || (cycleDistributionAmount == 0))
            return totalInvestedAssets;

        uint256 timestampDiff = block.timestamp - cycleStartTimestamp;

        uint256 ydcEndAmount = cycleStartAmount + cycleDistributionAmount;
        uint256 ydcCurrentAmount = ydcEndAmount;

        if (timestampDiff < cycleLength)
            ydcCurrentAmount =
                ydcEndAmount -
                (cycleDistributionAmount * (cycleLength - timestampDiff)) /
                cycleLength;

        // if there's a less funds, return the real funds
        if (totalInvestedAssets < ydcCurrentAmount) return totalInvestedAssets;

        return ydcCurrentAmount;
    }

    /**
     * Updates the yield distribution cycle or starts a new one if previous has finished. This function can be called when
     * there's a new epoch in Rysk if the funds changed.
     *
     * @notice It can be called by anyone because there's not harm from it, and it
     * makes the system less reliant on the backend.
     */
    function updateYieldDistributionCycle() public {
        uint256 totalInvestedAssets = _totalInvestedAssets();

        if (cycleStartAmount + cycleDistributionAmount == totalInvestedAssets)
            return;

        uint256 timestampDiff = block.timestamp - cycleStartTimestamp;

        // if there was yield being distributed
        if (cycleDistributionAmount > 0) {
            if (timestampDiff > cycleLength) {
                // when the yield distribution is at 100%
                cycleStartAmount += cycleDistributionAmount;
            } else {
                // When there's an epoch before the yield distribution cycle ends,
                // adjust the deposit amount according to the distributed percentage.
                cycleStartAmount +=
                    (cycleDistributionAmount * timestampDiff) /
                    cycleLength;
            }
        }

        // if funds were lost
        if (totalInvestedAssets < cycleStartAmount) {
            cycleStartAmount = totalInvestedAssets;
            cycleDistributionAmount = 0;
        } else {
            cycleDistributionAmount = totalInvestedAssets - cycleStartAmount;
        }

        cycleStartTimestamp = block.timestamp;

        emit StrategyYieldDistributionCycle(
            cycleStartTimestamp,
            cycleDistributionAmount,
            cycleStartAmount
        );
    }

    function _handleWthdrawalInYieldDistributionCycle(uint256 _amount)
        internal
    {
        if (_amount > cycleStartAmount) cycleStartAmount = 0;
        else cycleStartAmount -= _amount;
    }

    function _handleDepositInYieldDistributionCycle(uint256 _amount) internal {
        cycleStartAmount += _amount;
    }

    function _totalInvestedAssets() internal view virtual returns (uint256);
}
