// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

import {MockExchange} from "../MockExchange.sol";

contract MockSwapRouter is ISwapRouter, MockExchange {
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {}

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable override returns (uint256) {
        swapTokens(params.tokenIn, params.tokenOut, params.amountIn);

        uint256 amountOut = (params.amountIn *
            getExchangeRate(params.tokenIn, params.tokenOut)) / 1e18;

        if (params.amountOutMinimum > amountOut) {
            revert("MockSwapRouter: minimum amount not reached");
        }

        return amountOut;
    }

    function exactInput(
        ExactInputParams calldata params
    ) external payable override returns (uint256 amountOut) {}

    function exactOutputSingle(
        ExactOutputSingleParams calldata params
    ) external payable override returns (uint256 amountIn) {}

    function exactOutput(
        ExactOutputParams calldata params
    ) external payable override returns (uint256 amountIn) {}
}
