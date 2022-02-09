// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IStrategy} from "../strategy/IStrategy.sol";
import {BaseStrategy} from "../strategy/BaseStrategy.sol";

contract MockStrategy is BaseStrategy {
    constructor(
        address _vault,
        address _treasury,
        address _ethAnchorRouter,
        address _exchangeRateFeeder,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        uint16 _perfFeePct
    )
        BaseStrategy(
            _vault,
            _treasury,
            _ethAnchorRouter,
            _exchangeRateFeeder,
            _ustToken,
            _aUstToken,
            _perfFeePct,
            msg.sender
        )
    {}

    function doHardWork() external override(BaseStrategy) restricted {}

    function finishRedeemStable(uint256 idx) external {
        _finishRedeemStable(idx);
    }

    function investedAssets() external view override returns (uint256) {
        uint256 underlyingBalance = _getUnderlyingBalance() + pendingDeposits;
        uint256 aUstBalance = _getAUstBalance() + pendingRedeems;

        return
            underlyingBalance +
            ((exchangeRateFeeder.exchangeRateOf(address(ustToken), true) *
                aUstBalance) / 1e18);
    }
}
