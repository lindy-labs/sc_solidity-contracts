// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IStrategy} from "./IStrategy.sol";
import {BaseStrategy} from "./BaseStrategy.sol";

abstract contract LinearYieldDistributionStrategy is BaseStrategy {
    /**
     * Emmited when the yield distribution cycle is updated.
     *
     * @param syncYieldStartTimestamp the timestamp of the start of the current
     * yield distribution cycle.
     * @param syncYieldAmount the amount being distributed in the current cycle.
     * @param depositedAmount the sum of deposits and distributed yield in the
     * contract.
     */
    event StrategySyncYield(
        uint256 syncYieldStartTimestamp,
        uint256 syncYieldAmount,
        uint256 depositedAmount
    );

    // The length of a yield distribution cycle
    uint256 public yieldCycleLength;
    // The sum of deposits and distributed yield
    uint256 public depositedAmount;
    // The amount being distributed in the yield distribution cycle
    uint256 public syncYieldAmount;
    // The timestamp of the start of the yield distribution cycle
    uint256 public syncYieldStartTimestamp;

    constructor(
        address _vault,
        address _admin,
        IERC20 _underlying,
        uint256 _yieldCycleLength
    ) BaseStrategy(_vault, _underlying, _admin) {
        // TODO: check if the yield cycle length is valid
        require(_yieldCycleLength > 0, "Yield cycle length cannot be 0");

        yieldCycleLength = _yieldCycleLength;
    }

    /// @inheritdoc IStrategy
    function investedAssets()
        public
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        uint256 realDepositedAmount = _realInvestedAssets();

        if ((syncYieldStartTimestamp == 0) || (syncYieldAmount == 0))
            return realDepositedAmount;

        uint256 timestampDiff = block.timestamp - syncYieldStartTimestamp;

        uint256 cycleTotalDepositAmount = depositedAmount + syncYieldAmount;
        uint256 cycleDepositAmount = cycleTotalDepositAmount;

        if (timestampDiff < yieldCycleLength)
            cycleDepositAmount =
                cycleTotalDepositAmount -
                (syncYieldAmount * (yieldCycleLength - timestampDiff)) /
                yieldCycleLength;

        // if there's a less funds, return the real funds
        if (realDepositedAmount < cycleDepositAmount)
            return realDepositedAmount;

        return cycleDepositAmount;
    }

    /**
     * Updates the yield distribution cycle. This function can be called when
     * there's a new epoch in Rysk if the funds changed.
     *
     * @notice It can be called by anyone because there's not harm from it, and it
     * makes the system less reliant on the backend.
     */
    function syncYield() public {
        uint256 realDepositedAmount = _realInvestedAssets();

        if (depositedAmount + syncYieldAmount == realDepositedAmount) return;

        uint256 timestampDiff = block.timestamp - syncYieldStartTimestamp;

        // if there was yield being distributed
        if (syncYieldAmount > 0) {
            if (timestampDiff > yieldCycleLength) {
                // when the yield distribution is at 100%
                depositedAmount += syncYieldAmount;
            } else {
                // When there's an epoch before the yield distribution cycle ends,
                // adjust the deposit amount according to the distributed percentage.
                depositedAmount +=
                    (syncYieldAmount * (timestampDiff)) /
                    yieldCycleLength;
            }
        }

        // if funds were lost
        if (realDepositedAmount < depositedAmount) {
            depositedAmount = realDepositedAmount;
            syncYieldAmount = 0;
        } else {
            syncYieldAmount = realDepositedAmount - depositedAmount;
        }

        syncYieldStartTimestamp = block.timestamp;

        emit StrategySyncYield(
            syncYieldStartTimestamp,
            syncYieldAmount,
            depositedAmount
        );
    }

    function _accountForWithdrawal(uint256 _amount) internal {
        if (_amount > depositedAmount) depositedAmount = 0;
        else depositedAmount -= _amount;
    }

    function _accountForDeposit(uint256 _amount) internal {
        depositedAmount += _amount;
    }

    function _realInvestedAssets() internal view virtual returns (uint256);
}
