// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import {AnchorNonUSTStrategy} from "../../strategy/anchor/AnchorNonUSTStrategy.sol";
import {IExchangeRateFeeder} from "../../strategy/anchor/IExchangeRateFeeder.sol";
import {IUniswapV2Router01} from "./IUniswapV2Router01.sol";

/**
 * AnchorNonUSTStrategy for testnet.
 *
 * Since aUST/UST chainlink does not exist on testnet, we use EthAnchorExchangeRateFeeder
 * to get aUST/UST exchange rate.
 * And we use uniswap V2 to swap underlying to UST and vice versa.
 */
contract TestAnchorNonUSTStrategy is AnchorNonUSTStrategy {
    using SafeERC20 for IERC20;

    IExchangeRateFeeder public exchangeRateFeeder;
    IUniswapV2Router01 public uniV2Router;

    /**
     * @notice fake values are not being used.
     */
    constructor(
        address _vault,
        address _ethAnchorRouter,
        AggregatorV3Interface _aUstToUstFeed,
        IExchangeRateFeeder _exchangeRateFeeder,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        address _owner,
        address _uniV2Router
    )
        AnchorNonUSTStrategy(
            _vault,
            _ethAnchorRouter,
            _aUstToUstFeed,
            _ustToken,
            _aUstToken,
            _owner,
            address(0x1), // fake curve address
            0, // fake index
            1 // fake index
        )
    {
        exchangeRateFeeder = _exchangeRateFeeder;

        _aUstToUstFeedMultiplier = 1e18;

        uniV2Router = IUniswapV2Router01(_uniV2Router);

        // No need to initialize chainlink feed, because they don't exist on testnet
        initialized = true;
    }

    /**
     * Swap Underlying to UST through uniswap V2
     *
     * @param minExchangeRate minimum exchange rate of Underlying/UST.
     * @return swapped underlying amount
     */
    function _swapUnderlyingToUst(uint256 minExchangeRate)
        internal
        override
        returns (uint256)
    {
        require(
            minExchangeRate != 0,
            "AnchorNonUSTStrategy: minExchangeRate is zero"
        );
        uint256 underlyingBalance = _getUnderlyingBalance();
        require(
            underlyingBalance > 0,
            "AnchorNonUSTStrategy: no underlying exist"
        );

        address[] memory path = new address[](2);
        path[0] = address(underlying);
        path[1] = address(ustToken);
        underlying.safeIncreaseAllowance(
            address(uniV2Router),
            underlyingBalance
        );
        uniV2Router.swapExactTokensForTokens(
            underlyingBalance,
            (underlyingBalance * minExchangeRate) / 1e18,
            path,
            address(this),
            block.timestamp
        );

        return underlyingBalance;
    }

    /**
     * Swap UST to Underlying through uniswap V2
     *
     * @param minAmount minimum underlying amount to receive.
     */
    function _swapUstToUnderlying(uint256 minAmount) internal override {
        uint256 ustBalance = _getUstBalance();
        require(ustBalance != 0, "AnchorNonUSTStrategy: no UST exist");

        address[] memory path = new address[](2);
        path[0] = address(ustToken);
        path[1] = address(underlying);
        ustToken.safeIncreaseAllowance(address(uniV2Router), ustBalance);
        uniV2Router.swapExactTokensForTokens(
            ustBalance,
            minAmount,
            path,
            address(this),
            block.timestamp
        );
    }

    // get aUST/UST exchange rate from eth anchor ExchangeRateFeeder contract
    function _aUstToUstExchangeRate() internal view override returns (uint256) {
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
