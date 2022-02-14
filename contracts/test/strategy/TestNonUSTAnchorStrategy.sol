// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../strategy/NonUSTStrategy.sol";
import "../../strategy/anchor/IExchangeRateFeeder.sol";
import "./IUniswapV2Router01.sol";

/**
 * NonUSTAnchorStrategy for testnet.
 * Since aUST/UST chainlink does not exist on testnet, we use EthAnchorExchangeRateFeeder
 * to get aUST/UST exchange rate.
 * And we use uniswap V2 to swap underlying to UST and vice versa.
 */
contract TestNonUSTAnchorStrategy is NonUSTStrategy {
    using SafeERC20 for IERC20;

    IExchangeRateFeeder public exchangeRateFeeder;
    IUniswapV2Router01 public uniV2Router;

    constructor(
        address _vault,
        address _treasury,
        address _ethAnchorRouter,
        AggregatorV3Interface _aUstToUstFeed,
        IExchangeRateFeeder _exchangeRateFeeder,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        uint16 _perfFeePct,
        address _owner,
        address _uniV2Router
    )
        NonUSTStrategy(
            _vault,
            _treasury,
            _ethAnchorRouter,
            _aUstToUstFeed,
            _ustToken,
            _aUstToken,
            _perfFeePct,
            _owner,
            address(0x1),
            0,
            1
        )
    {
        exchangeRateFeeder = _exchangeRateFeeder;

        _aUstToUstFeedDecimals = 1e18;

        uniV2Router = IUniswapV2Router01(_uniV2Router);

        ustToken.safeIncreaseAllowance(_uniV2Router, type(uint256).max);
        underlying.safeIncreaseAllowance(_uniV2Router, type(uint256).max);

        // No need to initialize chainlink feed, because they don't exist on testnet
        initialized = true;
    }

    /**
     * Swap Underlying to UST through uniswap V2
     *
     * @return swapped underlying amount
     */
    function _swapUnderlyingToUst() internal override returns (uint256) {
        uint256 underlyingBalance = _getUnderlyingBalance();
        require(underlyingBalance > 0, "NonUSTStrategy: no underlying exist");

        address[] memory path = new address[](2);
        path[0] = address(underlying);
        path[1] = address(ustToken);
        uniV2Router.swapExactTokensForTokens(
            underlyingBalance,
            0,
            path,
            address(this),
            block.timestamp
        );

        return underlyingBalance;
    }

    /**
     * Swap UST to Underlying through uniswap V2
     *
     * @return swapped underlying amount
     */
    function _swapUstToUnderlying() internal override returns (uint256) {
        uint256 ustBalance = _getUstBalance();
        if (ustBalance > 0) {
            address[] memory path = new address[](2);
            path[0] = address(ustToken);
            path[1] = address(underlying);
            uniV2Router.swapExactTokensForTokens(
                ustBalance,
                0,
                path,
                address(this),
                block.timestamp
            );
            return _getUnderlyingBalance();
        }

        return 0;
    }

    // get aUST/UST exchange rate from eth anchor ExchangeRateFeeder contract
    function _aUstExchangeRate() internal view override returns (uint256) {
        return exchangeRateFeeder.exchangeRateOf(address(ustToken), true);
    }

    /**
     * @return Underlying value of UST amount
     *
     * @notice This uses spot price on Uniswap V2, and this could lead an attack,
     * however, since this is for testnet version, it is fine.
     */
    function _estimateUstAmountInUnderlying(uint256 ustAmount)
        internal
        view
        override
        returns (uint256)
    {
        address[] memory path = new address[](2);
        path[0] = address(ustToken);
        path[1] = address(underlying);

        uint256[] memory amountsOut = uniV2Router.getAmountsOut(
            ustAmount,
            path
        );
        return amountsOut[1];
    }
}
