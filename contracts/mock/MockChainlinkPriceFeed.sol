// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockChainlinkPriceFeed is AggregatorV3Interface {
    uint8 public override decimals;

    uint80 roundId_;
    int256 answer_;
    uint256 startedAt_;
    uint256 updatedAt_;
    uint80 answeredInRound_;

    constructor(uint8 _decimals) {
        decimals = _decimals;
    }

    function description() external pure override returns (string memory) {
        return "";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(
        uint80 /* _roundId */
    )
        external
        pure
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        // return all zero because this function not used
        return (0, 0, 0, 0, 0);
    }

    function setLatestRoundData(
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) external {
        roundId_ = roundId;
        answer_ = answer;
        startedAt_ = startedAt;
        updatedAt_ = updatedAt;
        answeredInRound_ = answeredInRound;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (roundId_, answer_, startedAt_, updatedAt_, answeredInRound_);
    }
}
