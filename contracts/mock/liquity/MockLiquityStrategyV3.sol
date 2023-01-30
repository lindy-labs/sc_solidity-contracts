// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {LiquityStrategy} from "../../strategy/liquity/LiquityStrategy.sol";

contract MockLiquityStrategyV3 is LiquityStrategy {
    function reinvest(
        address, // _swapTarget
        uint256, // _lqtyAmount,
        bytes calldata, // _lqtySwapData,
        uint256 _ethAmount,
        bytes calldata, // _ethSwapData,
        uint256 // _amountOutMin
    ) external virtual override onlyKeeper {
        emit StrategyReinvested(_ethAmount);
    }
}
