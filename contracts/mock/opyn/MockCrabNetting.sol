// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ICrabNetting} from "../../interfaces/opyn/ICrabStrategyV2.sol";

contract MockCrabNetting is ICrabNetting {
    function depositUSDC(uint256 _amount) external override {}

    function withdrawUSDC(uint256 _amount, bool _force) external override {}

    function queueCrabForWithdrawal(uint256 _amount) external override {}

    function dequeueCrab(uint256 _amount, bool _force) external override {}

    function usdBalance(address) external view override returns (uint256) {}

    function crabBalance(address) external view override returns (uint256) {}

    function depositsQueued() external view override returns (uint256) {}

    function withdrawsQueued() external view override returns (uint256) {}

    function netAtPrice(uint256 _price, uint256 _quantity) external {}

    function otcPriceTolerance() external view override returns (uint256) {}
}
