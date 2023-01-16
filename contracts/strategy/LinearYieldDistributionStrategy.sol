// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IStrategy} from "./IStrategy.sol";

import "hardhat/console.sol";

abstract contract LinearYieldDistributionStrategy is IStrategy {
    /**
     * Emmited when the yield distribution cycle is updated.
     *
     * @param startTimestamp the timestamp of the start of the current yield distribution cycle.
     * @param distributionAmount the amount being distributed in the current cycle.
     * @param startAmount the sum of deposits and distributed yield at the start of the cycle.
     */
    event StrategyNewYieldDistributionCycle(
        uint256 startTimestamp,
        uint256 duration,
        uint256 distributionAmount,
        uint256 startAmount
    );

    // The length of a yield distribution cycle
    uint256 public cycleDuration;
    // The amount being distributed in the yield distribution cycle
    uint256 public cycleDistributionAmount;
    // The timestamp of the start of the yield distribution cycle
    uint256 public cycleStartTimestamp;
    // The sum of deposits and distributed yield at the cycle start
    uint256 public cycleStartAmount;
    // The sum of deposits and distributed yield at the cycle end
    uint256 public cycleEndAmount;

    constructor(uint256 _yieldCycleDuration) {
        // TODO: check if the yield cycle duration is valid
        require(_yieldCycleDuration > 0, "Yield cycle length cannot be 0");

        cycleDuration = _yieldCycleDuration;
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

        // if there's no yield being distributed, return the real funds
        if ((cycleStartTimestamp == 0) || (cycleDistributionAmount == 0))
            return totalInvestedAssets;

        uint256 timeElapsed = block.timestamp - cycleStartTimestamp;
        uint256 cycleCurrentAmount = cycleEndAmount;

        if (timeElapsed < cycleDuration)
            cycleCurrentAmount =
                cycleEndAmount -
                (cycleDistributionAmount * (cycleDuration - timeElapsed)) /
                cycleDuration;

        // if there's less funds, return the real funds
        if (totalInvestedAssets < cycleCurrentAmount)
            return totalInvestedAssets;

        return cycleCurrentAmount;
    }

    /**
     * Updates the yield distribution cycle or starts a new one if previous has finished. This function can be called when
     * there's a new yield generated or when there's a loss in the strategy.
     *
     * @notice It can be called by anyone because there's not harm from it, and it
     * makes the system less reliant on the backend.
     */
    function updateYieldDistributionCycle() public {
        uint256 totalInvestedAssets = _totalInvestedAssets();

        // there is no new yield generated to distribute since cycle started
        if (cycleStartAmount + cycleDistributionAmount == totalInvestedAssets)
            return;

        // if there was yield being distributed
        if (cycleDistributionAmount > 0) {
            uint256 timeElapsed = block.timestamp - cycleStartTimestamp;

            if (timeElapsed > cycleDuration) {
                // when the yield distribution is at 100%
                cycleStartAmount += cycleDistributionAmount;
            } else {
                // when there's new yield generated before the yield distribution cycle ends,
                // adjust the deposit amount according to the distributed percentage
                cycleStartAmount +=
                    (cycleDistributionAmount * timeElapsed) /
                    cycleDuration;
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

        emit StrategyNewYieldDistributionCycle(
            cycleStartTimestamp,
            cycleDuration,
            cycleDistributionAmount,
            cycleStartAmount
        );
    }

    /**
     * Handles the withdrawal of funds in the yield distribution cycle. This function should be called by the strategy implementation.
     */
    function _handleWthdrawalInYieldDistributionCycle(uint256 _amount)
        internal
    {
        if (_amount > cycleStartAmount) cycleStartAmount = 0;
        else cycleStartAmount -= _amount;

        cycleEndAmount -= _amount;
    }

    /**
     * Handles the deposit of funds in the yield distribution cycle. This function should be called by the strategy implementation.
     */
    function _handleDepositInYieldDistributionCycle(uint256 _amount) internal {
        cycleStartAmount += _amount;
        cycleEndAmount += _amount;
    }

    /**
     * Returns the total invested assets in the strategy if there's no delay in yield distribution, ie the actual invested assets.
     */
    function _totalInvestedAssets() internal view virtual returns (uint256);
}
