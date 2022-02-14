// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "../../strategy/USTStrategy.sol";
import "../../strategy/anchor/IExchangeRateFeeder.sol";

/**
 * USTAnchorStrategy for testnet.
 * Since aUST/UST chainlink does not exist on testnet, we use EthAnchorExchangeRateFeeder
 * to get aUST/UST exchange rate.
 */
contract TestUSTAnchorStrategy is USTStrategy {
    IExchangeRateFeeder public exchangeRateFeeder;

    /**
     * @notice _aUstToUstFeed is a fake chainlink feed, it is used to just
     * inhert constructor of USTStrategy
     */
    constructor(
        address _vault,
        address _treasury,
        address _ethAnchorRouter,
        AggregatorV3Interface _aUstToUstFeed,
        IExchangeRateFeeder _exchangeRateFeeder,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        uint16 _perfFeePct,
        address _owner
    )
        USTStrategy(
            _vault,
            _treasury,
            _ethAnchorRouter,
            _aUstToUstFeed,
            _ustToken,
            _aUstToken,
            _perfFeePct,
            _owner
        )
    {
        exchangeRateFeeder = _exchangeRateFeeder;
        _aUstToUstFeedDecimals = 1e18;
    }

    // get aUST/UST exchange rate from eth anchor ExchangeRateFeeder contract
    function _aUstExchangeRate() internal view override returns (uint256) {
        return exchangeRateFeeder.exchangeRateOf(address(ustToken), true);
    }
}
