// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {LiquityStrategy} from "../../strategy/liquity/LiquityStrategy.sol";

contract MockLiquityStrategyV2 is LiquityStrategy {
    error HarvestError();

    address public newToken;

    function updateNewToken(address _token) public onlyAdmin {
        newToken = _token;
    }

    // adding a new method to the new version to check if working correctly
    function getVersion() public pure returns (uint256) {
        return 2;
    }

    // override the harvest method in the new version and switch it off
    function harvest(
        address _swapTarget,
        bytes calldata _lqtySwapData,
        bytes calldata _ethSwapData
    ) external virtual override {
        revert HarvestError();
    }
}
