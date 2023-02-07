// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ICrabStrategyV2} from "../../interfaces/opyn/ICrabStrategyV2.sol";
import {MockERC20} from "../MockERC20.sol";

contract MockCrabStrategyV2 is ICrabStrategyV2, MockERC20 {
    uint256 public totalCollateral;
    uint256 public totalDebt;

    constructor() MockERC20("Mock CRAB", "mockCRAB", 18, 0) {}

    function mintCrab(address _user, uint256 _amount) public {
        _mint(_user, _amount);
        totalDebt += _amount;
    }

    function setCollateral() external payable {
        totalCollateral += msg.value;
    }

    function getVaultDetails()
        external
        view
        override
        returns (address, uint256, uint256, uint256)
    {
        return (address(0), 0, totalCollateral, totalDebt);
    }

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

    receive() external payable {}
}
