// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * ERC20 token interface with decimals
 */
interface IERC20Detailed is IERC20 {
    function decimals() external view returns (uint8);
}
