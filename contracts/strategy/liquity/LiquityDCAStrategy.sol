// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {PercentMath} from "../../lib/PercentMath.sol";
import {LiquityStrategy} from "./LiquityStrategy.sol";

/***
 * An extended version of LiquityStrategy that allows generated yield to be distributed as ETH.
 */
contract LiquityDCAStrategy is LiquityStrategy {
    using PercentMath for uint256;

    error StrategyETHTransferFailed(address to);

    event StrategyYieldTransferred(address to, uint256 amount);

    /// @inheritdoc LiquityStrategy
    function transferYield(address _to, uint256 _amount)
        external
        override(LiquityStrategy)
        onlyManager
        returns (uint256)
    {
        uint256 ethBalance = address(this).balance;

        if (ethBalance == 0) return 0;

        uint256 amountInETH = _getExchangeAmountInETH(_amount);

        uint256 ethToTransfer = amountInETH > ethBalance
            ? ethBalance
            : amountInETH;

        _sendETH(_to, ethToTransfer);

        uint256 equivalentAmountInUnderlying = _amount.pctOf(
            ethToTransfer.inPctOf(amountInETH)
        );

        emit StrategyYieldTransferred(_to, equivalentAmountInUnderlying);

        return equivalentAmountInUnderlying;
    }

    /**
     * Gets the amount of ETH that can be exchanged for the given amount of underlying asset (LUSD).
     * Uses curve LUSD/USDT & ETH/USDT pools to calculate the amount of ETH that can be exchanged for the given amount of LUSD.
     *
     * @param _underlyingAmount The amount of underlying asset (LUSD) to be exchanged.
     */
    function _getExchangeAmountInETH(uint256 _underlyingAmount)
        internal
        view
        returns (uint256)
    {
        uint256 amountInUSDT = curveExchange.get_exchange_amount(
            LUSD_CURVE_POOL,
            address(underlying),
            USDT,
            _underlyingAmount
        );

        uint256 amountInETH = curveExchange.get_exchange_amount(
            WETH_CURVE_POOL,
            USDT,
            WETH,
            amountInUSDT
        );

        return amountInETH;
    }

    /**
     * Sends ETH to the specified @param _to address. Reverts if the transfer fails.
     *
     * @param _to The address to send ETH to
     * @param _amount The amount of ETH to send
     */
    function _sendETH(address _to, uint256 _amount) internal {
        (bool sent, ) = _to.call{value: _amount}("");

        if (!sent) revert StrategyETHTransferFailed(_to);
    }
}
