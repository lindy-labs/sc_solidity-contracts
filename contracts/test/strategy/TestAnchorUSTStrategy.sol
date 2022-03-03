// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import {AnchorUSTStrategy} from "../../strategy/anchor/AnchorUSTStrategy.sol";
import {IExchangeRateFeeder} from "../../strategy/anchor/IExchangeRateFeeder.sol";

/**
 * AnchorUSTStrategy for testnet.
 * Since aUST/UST chainlink does not exist on testnet, we use EthAnchorExchangeRateFeeder
 * to get aUST/UST exchange rate.
 */
contract TestAnchorUSTStrategy is AnchorUSTStrategy {
    IExchangeRateFeeder public exchangeRateFeeder;

    /**
     * @notice _aUstToUstFeed is a fake chainlink feed, it is used to just
     * inhert constructor of USTStrategy
     */
    constructor(
        address _vault,
        address _ethAnchorRouter,
        AggregatorV3Interface _aUstToUstFeed,
        IExchangeRateFeeder _exchangeRateFeeder,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        address _owner
    )
        AnchorUSTStrategy(
            _vault,
            _ethAnchorRouter,
            _aUstToUstFeed,
            _ustToken,
            _aUstToken,
            _owner
        )
    {
        exchangeRateFeeder = _exchangeRateFeeder;
        _aUstToUstFeedMultiplier = 1e18;
    }

    // get aUST/UST exchange rate from eth anchor ExchangeRateFeeder contract
    function _aUstToUstExchangeRate() internal view override returns (uint256) {
        return exchangeRateFeeder.exchangeRateOf(address(ustToken), true);
    }
}
