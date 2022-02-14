// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "../../strategy/USTStrategy.sol";
import "../../strategy/anchor/IExchangeRateFeeder.sol";

/**
 * USTEthAnchorStrategy for testnet.
 * Since aUST/UST chainlink does not exist on testnet, we use EthAnchorExchangeRateFeeder
 * to get aUST/UST exchange rate.
 */
abstract contract TestUSTEthAnchorStrategy is USTStrategy {
    IExchangeRateFeeder public exchangeRateFeeder;

    constructor(
        address _vault,
        address _treasury,
        address _ethAnchorRouter,
        IExchangeRateFeeder _exchangeRateFeeder,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        uint16 _perfFeePct,
        address _owner
    ) {
        require(_owner != address(0), "BaseStrategy: owner is 0x");
        require(_ethAnchorRouter != address(0), "BaseStrategy: router is 0x");
        require(_treasury != address(0), "BaseStrategy: treasury is 0x");
        require(
            PercentMath.validPerc(_perfFeePct),
            "BaseStrategy: invalid performance fee"
        );
        require(underlying == _ustToken, "USTStrategy: invalid underlying");

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MANAGER_ROLE, _vault);

        treasury = _treasury;
        vault = _vault;
        underlying = IVault(_vault).underlying();
        ethAnchorRouter = IEthAnchorRouter(_ethAnchorRouter);
        exchangeRateFeeder = _exchangeRateFeeder;
        ustToken = _ustToken;
        aUstToken = _aUstToken;
        perfFeePct = _perfFeePct;

        _aUstToUstFeedDecimals = 1e18;
    }

    // get aUST/UST exchange rate from eth anchor ExchangeRateFeeder contract
    function _aUstExchangeRate() internal view override returns (uint256) {
        return exchangeRateFeeder.exchangeRateOf(address(ustToken), true);
    }
}
