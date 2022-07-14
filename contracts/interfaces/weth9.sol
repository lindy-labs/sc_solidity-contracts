// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

interface weth9 {
    function deposit() external payable;

    function withdraw(uint256 wad) external payable;
}
