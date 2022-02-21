// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./curve/ICurve.sol";
import "./BaseStrategy.sol";
import "./IERC20Detailed.sol";

/**
 * Strategy that handles non-UST tokens, by first converting them to UST via
 * Curve (https://curve.fi/), and only then depositing into EthAnchor
 */
contract NonUSTStrategy is BaseStrategy {
    using SafeERC20 for IERC20;

    event Initialized();

    // address of the Curve pool to use
    ICurve public immutable curvePool;

    // index of the underlying token in the pool
    int128 public immutable underlyingI;

    // index of the UST token in the pool
    int128 public immutable ustI;

    // flag to indicate initialization status
    bool public initialized;

    // Chainlink UST / USD feed
    AggregatorV3Interface public ustFeed;

    // Decimals of ust feed
    uint256 internal ustFeedDecimals;

    // Chainlink underlying / USD feed - ex. USDT / USD
    AggregatorV3Interface public underlyingFeed;

    // Decimals of underlying feed
    uint256 internal underlyingFeedDecimals;

    // Decimals of underlying token
    uint256 internal immutable underlyingDecimals;

    // Decimals of UST token
    uint256 internal immutable ustDecimals;

    constructor(
        address _vault,
        address _treasury,
        address _ethAnchorRouter,
        AggregatorV3Interface _aUstToUstFeed,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        uint16 _perfFeePct,
        address _owner,
        address _curvePool,
        int128 _underlyingI,
        int128 _ustI
    )
        BaseStrategy(
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
        require(underlying != _ustToken, "invalid underlying");
        require(_curvePool != address(0), "0x addr");
        curvePool = ICurve(_curvePool);
        underlyingI = _underlyingI;
        ustI = _ustI;

        ustToken.safeIncreaseAllowance(_curvePool, type(uint256).max);
        underlying.safeIncreaseAllowance(_curvePool, type(uint256).max);

        ustDecimals = 10**IERC20Detailed(address(ustToken)).decimals();
        underlyingDecimals = 10**IERC20Detailed(address(underlying)).decimals();
    }

    function initializeStrategy(
        AggregatorV3Interface _ustFeed,
        AggregatorV3Interface _underlyingFeed
    ) external onlyAdmin {
        require(!initialized, "already initialized");

        initialized = true;

        ustFeed = _ustFeed;
        ustFeedDecimals = 10**_ustFeed.decimals();
        underlyingFeed = _underlyingFeed;
        underlyingFeedDecimals = 10**_underlyingFeed.decimals();

        emit Initialized();
    }

    /**
     * Swaps the underlying currency for UST, and initiates a deposit of all
     * the converted UST into EthAnchor
     *
     * @notice since EthAnchor uses an asynchronous model, this function
     * only starts the deposit process, but does not finish it.
     */
    function doHardWork() external override(BaseStrategy) onlyManager {
        require(initialized, "not initialized");
        _swapUnderlyingToUst();
        _initDepositStable();
    }

    /**
     * Calls Curve to convert the existing underlying balance into UST
     */
    function _swapUnderlyingToUst() internal {
        uint256 underlyingBalance = _getUnderlyingBalance();
        if (underlyingBalance > 0) {
            // slither-disable-next-line unused-return
            curvePool.exchange_underlying(
                underlyingI,
                ustI,
                underlyingBalance,
                0
            );
        }
    }

    /**
     * Calls Curve to convert the existing UST back into the underlying token
     */
    function _swapUstToUnderlying() internal returns (uint256) {
        uint256 ustBalance = _getUstBalance();
        if (ustBalance > 0) {
            // slither-disable-next-line unused-return
            return
                curvePool.exchange_underlying(ustI, underlyingI, ustBalance, 0);
        }

        return 0;
    }

    /**
     * Calls EthAnchor with a pending redeem ID, and attempts to finish it.
     * Once UST is retrieved, convert it back to underlying via Curve
     *
     * @notice Must be called some time after `initRedeemStable()`. Will only work if
     * the EthAnchor bridge has finished processing the deposit.
     *
     * @param idx Id of the pending redeem operation
     */
    function finishRedeemStable(uint256 idx) external onlyManager {
        _finishRedeemStable(idx);
        _swapUstToUnderlying();
        underlying.safeTransfer(vault, _getUnderlyingBalance());
    }

    /**
     * Amount, expressed in the underlying currency, currently in the strategy
     *
     * @notice both held and invested amounts are included here, using the
     * latest known exchange rates to the underlying currency
     *
     * @return The total amount of underlying
     */
    function investedAssets()
        external
        view
        override(BaseStrategy)
        returns (uint256)
    {
        return
            _estimateInvestedAmountInUnderlying(
                pendingDeposits + _estimateAUstBalanceInUstMinusFee()
            );
    }

    function _estimateInvestedAmountInUnderlying(uint256 ustAmount)
        internal
        view
        returns (uint256)
    {
        (
            uint80 ustRoundID,
            int256 ustPrice,
            ,
            uint256 ustUpdateTime,
            uint80 ustAnsweredInRound
        ) = ustFeed.latestRoundData();
        (
            uint80 underlyingRoundID,
            int256 underlyingPrice,
            ,
            uint256 underlyingUpdateTime,
            uint80 underlyingAnsweredInRound
        ) = underlyingFeed.latestRoundData();
        require(
            ustPrice > 0 &&
                underlyingPrice > 0 &&
                ustUpdateTime != 0 &&
                underlyingUpdateTime != 0 &&
                ustAnsweredInRound >= ustRoundID &&
                underlyingAnsweredInRound >= underlyingRoundID,
            "invalid price"
        );
        return
            (ustAmount *
                uint256(ustPrice) *
                underlyingFeedDecimals *
                underlyingDecimals) /
            (uint256(underlyingPrice) * ustFeedDecimals * ustDecimals);
    }
}
