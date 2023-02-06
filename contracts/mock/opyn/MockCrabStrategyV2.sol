// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ICrabStrategyV2} from "../../interfaces/opyn/ICrabStrategyV2.sol";

contract MockCrabStrategyV2 is ICrabStrategyV2 {
    function totalSupply() external pure override returns (uint256) {
        return 1e18;
    }

    function balanceOf(
        address account
    ) external view override returns (uint256) {}

    function transfer(
        address to,
        uint256 amount
    ) external override returns (bool) {}

    function allowance(
        address owner,
        address spender
    ) external view override returns (uint256) {}

    function approve(
        address spender,
        uint256 amount
    ) external override returns (bool) {}

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external override returns (bool) {}

    function getVaultDetails()
        external
        view
        override
        returns (address, uint256, uint256, uint256)
    {}

    function flashDeposit(
        uint256 _ethToDeposit,
        uint24 _poolFee
    ) external payable override {}

    function flashWithdraw(
        uint256 _crabAmount,
        uint256 _maxEthToPay,
        uint24 _poolFee
    ) external override {}

    function deposit() external payable override {}

    function getWsqueethFromCrabAmount(
        uint256 _crabAmount
    ) external view override returns (uint256) {}
}
