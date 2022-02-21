// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {AnchorBaseStrategy} from "../strategy/anchor/AnchorBaseStrategy.sol";

contract MockStrategy is AnchorBaseStrategy {
    constructor(
        address _vault,
        address _treasury,
        address _ethAnchorRouter,
        AggregatorV3Interface _aUstToUstFeed,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        uint16 _perfFeePct
    )
        AnchorBaseStrategy(
            _vault,
            _treasury,
            _ethAnchorRouter,
            _aUstToUstFeed,
            _ustToken,
            _aUstToken,
            _perfFeePct,
            msg.sender
        )
    {}

    function invest(bytes calldata)
        external
        override(AnchorBaseStrategy)
        onlyManager
    {}

    function finishRedeemStable(uint256 idx) external {
        _finishRedeemStable(idx);
    }

    function investedAssets() external view override returns (uint256) {
        uint256 underlyingBalance = _getUnderlyingBalance() + pendingDeposits;

        return underlyingBalance + _estimateAUstBalanceInUstMinusFee();
    }
}
