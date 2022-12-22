// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {LiquityStrategy} from '../../contracts/strategy/liquity/LiquityStrategy.sol';

contract LiquityStrategyHarness is LiquityStrategy {

    function getEthBalance() external view returns (uint256) {
        return address(this).balance;
    }
}