// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

/// https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/ISwapRouter.sol
interface IUniswapV3SwapRouter {
    function exactInput(IUniswapV3SwapRouter.ExactInputParams memory params)
        external
        returns (uint256 amountOut);

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
}
