// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {AnchorStrategy} from "../strategy/anchor/AnchorStrategy.sol";

contract MockStrategy is AnchorStrategy {
    constructor(
        address _vault,
        address _ethAnchorRouter,
        AggregatorV3Interface _aUstToUstFeed,
        IERC20 _ustToken,
        IERC20 _aUstToken
    )
        AnchorStrategy(
            _vault,
            _ethAnchorRouter,
            _aUstToUstFeed,
            _ustToken,
            _aUstToken,
            msg.sender
        )
    {}

    function invest() external override(AnchorStrategy) onlyManager {}

    function investedAssets() external view override returns (uint256) {
        uint256 underlyingBalance = _getUnderlyingBalance() + pendingDeposits;

        return underlyingBalance + _estimateAUstBalanceInUst();
    }

    function setAllRedeemed(bool __allRedeemed) external {
        _allRedeemed = __allRedeemed;
    }
}
