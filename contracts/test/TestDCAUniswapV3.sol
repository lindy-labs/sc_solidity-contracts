// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {DCAUniswapV3} from "../integrations/DCA/DCAUniswapV3.sol";

contract TestDCAUniswapV3 is DCAUniswapV3 {
    constructor(
        address _vault,
        address _output,
        bytes memory _path,
        uint256 _period
    ) DCAUniswapV3(_vault, _output, _path, _period, msg.sender) {}

    function test_claimFromVault() external {
        _claimFromVault();
    }

    function test_swap(uint256 _amountOutMin, uint256 _deadline) external {
        _swap(_amountOutMin, _deadline);
    }
}
