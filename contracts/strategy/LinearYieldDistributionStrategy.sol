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
     * @param startAmount the sum of deposits and distributed yield at the start of the cycle.
     * @param endAmount the sum of deposits and distributed yield at the end of the cycle.
     */
    event StrategyYieldDistributionCycleUpdate(
        uint256 startTimestamp,
        uint256 distributionAmount,
        uint256 startAmount,
        uint256 endAmount
    );

    // The length of a yield distribution cycle
    uint256 public cycleLength;
    // The amount being distributed in the yield distribution cycle
    uint256 public cycleDistributionAmount;
    // The timestamp of the start of the yield distribution cycle
    uint256 public cycleStartTimestamp;
    // The sum of deposits and distributed yield at the cycle start
    uint256 public cycleStartAmount;
    // The sum of deposits and distributed yield at the cycle end
    uint256 public cycleEndAmount;

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

        uint256 timeDelta = block.timestamp - cycleStartTimestamp;

        uint256 cycleCurrentAmount = cycleEndAmount;

        if (timeDelta < cycleLength)
            cycleCurrentAmount =
                cycleEndAmount -
                (cycleDistributionAmount * (cycleLength - timeDelta)) /
                cycleLength;

        // if there's a less funds, return the real funds
        if (totalInvestedAssets < cycleCurrentAmount)
            return totalInvestedAssets;

        return cycleCurrentAmount;
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

        // there is no new yield generated to distribute since cycle started
        if (cycleStartAmount + cycleDistributionAmount == totalInvestedAssets)
            return;

        uint256 timeDelta = block.timestamp - cycleStartTimestamp;

        // if there was yield being distributed
        if (cycleDistributionAmount > 0) {
            if (timeDelta > cycleLength) {
                // when the yield distribution is at 100%
                cycleStartAmount += cycleDistributionAmount;
            } else {
                // When there's new yield generated before the yield distribution cycle ends,
                // adjust the deposit amount according to the distributed percentage.
                cycleStartAmount +=
                    (cycleDistributionAmount * timeDelta) /
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
        cycleEndAmount = totalInvestedAssets;

        emit StrategyYieldDistributionCycleUpdate(
            cycleStartTimestamp,
            cycleStartAmount,
            cycleStartAmount,
            cycleEndAmount
        );
    }

    function _handleWthdrawalInYieldDistributionCycle(uint256 _amount)
        internal
    {
        if (_amount > cycleStartAmount) cycleStartAmount = 0;
        else cycleStartAmount -= _amount;

        cycleEndAmount -= _amount;
    }

    function _handleDepositInYieldDistributionCycle(uint256 _amount) internal {
        cycleStartAmount += _amount;
        cycleEndAmount += _amount;
    }

    function _totalInvestedAssets() internal view virtual returns (uint256);
}
