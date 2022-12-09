// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockLUSD is ERC20 {

    constructor() ERC20("LUSD", "LUSD") {}
}