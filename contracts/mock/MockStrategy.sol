// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {AnchorBaseStrategy} from "../strategy/anchor/AnchorBaseStrategy.sol";

contract MockStrategy is AnchorBaseStrategy {
    using SafeERC20 for IERC20;

    event InvestedWithData(bytes data);
    event DisivestedWithData(uint256 amount, bytes data);

    constructor(
        address _vault,
        address _ethAnchorRouter,
        AggregatorV3Interface _aUstToUstFeed,
        IERC20 _ustToken,
        IERC20 _aUstToken
    )
        AnchorBaseStrategy(
            _vault,
            _ethAnchorRouter,
            _aUstToUstFeed,
            _ustToken,
            _aUstToken,
            msg.sender
        )
    {}

    function invest(bytes calldata data)
        external
        override(AnchorBaseStrategy)
        onlyManager
    {
        emit InvestedWithData(data);
    }

    function withdrawToVault(uint256 amount, bytes calldata data)
        external
        override
        onlyManager
    {
        underlying.safeTransfer(vault, amount);

        emit DisivestedWithData(amount, data);
    }

    function finishRedeemStable(uint256 idx) external {
        _finishRedeemStable(idx);
    }

    function investedAssets() external view override returns (uint256) {
        uint256 underlyingBalance = _getUnderlyingBalance() + pendingDeposits;

        return underlyingBalance + _estimateAUstBalanceInUst();
    }

    function setAllRedeemed(bool __allRedeemed) external {
        _allRedeemed = __allRedeemed;
    }
}
