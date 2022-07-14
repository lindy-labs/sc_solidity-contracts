// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IStabilityPool} from "../../interfaces/liquity/IStabilityPool.sol";

contract MockStabilityPool is IStabilityPool {
    function provideToSP(uint256 _amount, address _frontEndTag) external {}

    function withdrawFromSP(uint256 _amount) external {}

    function getDepositorETHGain(address _depositor)
        external
        view
        returns (uint256)
    {}

    function getDepositorLQTYGain(address _depositor)
        external
        view
        returns (uint256)
    {}

    function getCompoundedLUSDDeposit(address _depositor)
        external
        view
        returns (uint256)
    {}
}
