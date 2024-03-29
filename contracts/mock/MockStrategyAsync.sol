// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockStrategySync} from "./MockStrategySync.sol";

contract MockStrategyAsync is MockStrategySync {
    constructor(
        address _vault,
        IERC20 _underlying,
        address _admin
    ) MockStrategySync(_vault, _underlying, _admin) {}

    function isSync() external pure override(MockStrategySync) returns (bool) {
        return false;
    }
}
