// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ICrabStrategyV2} from "../../interfaces/opyn/ICrabStrategyV2.sol";
import {MockERC20} from "../MockERC20.sol";
import {PercentMath} from "../../lib/PercentMath.sol";

contract MockCrabStrategyV2 is ICrabStrategyV2, MockERC20 {
    using PercentMath for uint256;

    // total collateral & total debt are expressed in eth for simplicity
    uint256 public totalCollateral;
    uint256 public totalDebt;
    uint256 public strategyCap;

    constructor() MockERC20("Mock CRAB", "mockCRAB", 18, 0) {
        strategyCap = 100000 ether;
    }

    function setCollateralCap(uint256 _ethAmount) external payable {
        strategyCap = _ethAmount;
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
        uint256 _totalEthToDeposit,
        uint24 // poolFee
    ) external payable override {
        if (totalCollateral + _totalEthToDeposit > strategyCap) {
            revert("MockCrabStrategyV2: cap reached");
        }

        // the intention is to simulate how would the flash deposit work in the real world
        // collateralization ratio is always preserved
        uint256 collateralizationRatio = getCollateralizationRatio();
        uint256 optimalEthToBorrow = (_totalEthToDeposit * 1e18) /
            collateralizationRatio;
        uint256 optimalEthToUse = _totalEthToDeposit - optimalEthToBorrow;
        uint256 ethToUse = msg.value;

        if (optimalEthToUse < ethToUse) {
            // we have more eth than optimal, so we will return the excess eth
            uint256 ethToReturn = ethToUse - optimalEthToUse;
            ethToUse = optimalEthToUse;

            payable(msg.sender).transfer(ethToReturn);
        } else if (optimalEthToUse > msg.value) {
            // we have less eth than optimal, so we are borrowing more than we should and tx will revert
            revert("MockCrabStrategyV2: not enough eth for flash swap");
        }

        // total collateral (eth) : total debt (short squeeth) has to be 2 : 1 (as initialzied)
        totalCollateral += _totalEthToDeposit;
        totalDebt += (_totalEthToDeposit * 1e18) / collateralizationRatio;

        // crab should represent the share of the collateral
        // for simplicity we will mint 1 crab for 2 eth
        uint256 crabToMint = _totalEthToDeposit / 2;

        _mint(msg.sender, crabToMint);
    }

    function flashWithdraw(
        uint256 _crabAmount,
        uint256 _maxEthToPay,
        uint24 //_poolFee
    ) external override {
        // the intention is to simulate how would the flash withdraw work in the real world
        // collateralization ratio is always preserved
        if (_crabAmount > balanceOf(msg.sender)) {
            revert("MockCrabStrategyV2: not enough crab");
        }

        uint256 collateralShare = (totalCollateral * _crabAmount) /
            totalSupply();
        uint256 debtShare = (totalDebt * _crabAmount) / totalSupply();

        require(
            debtShare <= _maxEthToPay,
            "MockCrabStrategyV2: not enough eth for flash swap"
        );

        _burn(msg.sender, _crabAmount);
        totalCollateral -= collateralShare;
        totalDebt -= debtShare;

        uint256 ethProceeds = collateralShare - debtShare;
        payable(msg.sender).transfer(ethProceeds);
    }

    function deposit() external payable override {}

    function getWsqueethFromCrabAmount(
        uint256 _crabAmount
    ) external view override returns (uint256) {
        return (_crabAmount * totalDebt) / totalSupply();
    }

    function getCollateralizationRatio() public view returns (uint256) {
        // default to 200%
        if (totalDebt == 0 || totalCollateral == 0) return 2e18;

        return (totalCollateral * 1e18) / totalDebt;
    }

    // msg.value is the collateral
    function initialize(uint256 debt) external payable {
        require(totalSupply() == 0, "MockCrabStrategyV2: already initialized");

        // initialize with 200% collateralization ratio
        totalCollateral = msg.value;
        totalDebt = debt;
        // mint 1 crab for 2 eth collateral
        _mint(address(this), msg.value / 2);
    }

    function reduceDebt(uint256 _amount) external {
        totalDebt -= _amount;
    }

    function increaseDebt(uint256 _amount) external {
        totalDebt += _amount;
    }

    function transferCrab(address _to, uint256 _amount) external {
        _transfer(address(this), _to, _amount);
    }
}
