// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import {ICurve} from "../curve/ICurve.sol";
import {IERC20Detailed} from "../IERC20Detailed.sol";
import {AnchorBaseStrategy} from "./AnchorBaseStrategy.sol";

/**
 * EthAnchor Strategy that handles non-UST tokens, by first converting them to UST via
 * Curve (https://curve.fi/), and only then depositing into EthAnchor
 */
contract AnchorNonUSTStrategy is AnchorBaseStrategy {
    using SafeERC20 for IERC20;

    event Initialized();

    // UST / USDC / USDT / DAI curve pool address
    ICurve public curvePool;

    // index of the underlying token in the curve pool
    int128 public underlyingI;

    // index of the UST token in the curve pool
    int128 public ustI;

    // flag to indicate initialization status
    bool public initialized;

    // Chainlink UST / USD feed
    AggregatorV3Interface public ustFeed;

    // Chainlink underlying / USD feed - ex. USDT / USD
    AggregatorV3Interface public underlyingFeed;

    // Underlying decimals multiplier to calculate UST -> Underlying amount
    uint256 internal _underlyingDecimalsMultiplier;

    // UST decimals multiplier to calculate UST -> Underlying amount
    uint256 internal _ustDecimalsMultiplier;

    /**
     * Constructor of Non-UST Strategy
     *
     * @notice The underlying token must be different from UST token.
     *
     * @param _curvePool UST curve pool to swap UST
     * @param _underlyingI underlying curve index in the pool
     * @param _ustI UST curve index in the pool
     */
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
        AnchorBaseStrategy(
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
        require(
            underlying != _ustToken,
            "AnchorNonUSTStrategy: invalid underlying"
        );
        require(
            _curvePool != address(0),
            "AnchorNonUSTStrategy: curve pool is 0x"
        );
        curvePool = ICurve(_curvePool);
        underlyingI = _underlyingI;
        ustI = _ustI;
    }

    /**
     * Initialize UST / USD, and Underlying / USD chainlink feed
     *
     * @notice Since constructor has too many variables, we initialize these feed
     * in different function
     */
    function initializeStrategy(
        AggregatorV3Interface _ustFeed,
        AggregatorV3Interface _underlyingFeed
    ) external onlyAdmin {
        require(!initialized, "AnchorNonUSTStrategy: already initialized");

        initialized = true;

        ustFeed = _ustFeed;
        underlyingFeed = _underlyingFeed;

        uint8 _underlyingDecimals = _underlyingFeed.decimals() +
            IERC20Detailed(address(underlying)).decimals();
        uint8 _ustDecimals = _ustFeed.decimals() +
            IERC20Detailed(address(ustToken)).decimals();

        // Set underlying decimals multiplier and UST decimals multiplier based on
        // feeds and token decimals
        if (_underlyingDecimals > _ustDecimals) {
            _underlyingDecimalsMultiplier =
                10**(_underlyingDecimals - _ustDecimals);
            _ustDecimalsMultiplier = 1;
        } else if (_underlyingDecimals < _ustDecimals) {
            _underlyingDecimalsMultiplier = 1;
            _ustDecimalsMultiplier = 10**(_ustDecimals - _underlyingDecimals);
        } else {
            _underlyingDecimalsMultiplier = 1;
            _ustDecimalsMultiplier = 1;
        }

        emit Initialized();
    }

    /**
     * Swaps the underlying currency for UST, and initiates a deposit of all
     * the converted UST into EthAnchor
     *
     * @notice since EthAnchor uses an asynchronous model, this function
     * only starts the deposit process, but does not finish it.
     */
    function doHardWork() external override(AnchorBaseStrategy) onlyManager {
        require(initialized, "AnchorNonUSTStrategy: not initialized");
        uint256 underlyingAmount = _swapUnderlyingToUst();

        (address operator, uint256 ustAmount) = _initDepositStable();

        emit InitDepositStable(
            operator,
            depositOperations.length - 1,
            underlyingAmount,
            ustAmount
        );
    }

    /**
     * Calls Curve to convert the existing underlying balance into UST
     *
     * @return swapped underlying amount
     */
    function _swapUnderlyingToUst() internal virtual returns (uint256) {
        uint256 underlyingBalance = _getUnderlyingBalance();
        require(
            underlyingBalance > 0,
            "AnchorNonUSTStrategy: no underlying exist"
        );

        underlying.safeIncreaseAllowance(address(curvePool), underlyingBalance);
        // slither-disable-next-line unused-return
        curvePool.exchange_underlying(underlyingI, ustI, underlyingBalance, 0);

        return underlyingBalance;
    }

    /**
     * Calls Curve to convert the existing UST back into the underlying token
     *
     * @return swapped underlying amount
     */
    function _swapUstToUnderlying() internal virtual returns (uint256) {
        uint256 ustBalance = _getUstBalance();
        if (ustBalance > 0) {
            ustToken.safeIncreaseAllowance(address(curvePool), ustBalance);
            // slither-disable-next-line unused-return
            return
                curvePool.exchange_underlying(ustI, underlyingI, ustBalance, 0);
        }

        return 0;
    }

    /**
     * Calls EthAnchor with a pending redeem ID, and attempts to finish it.
     * Once UST is retrieved, convert it back to underlying via Curve
     * Then transfer underlying to vault.
     *
     * @notice Must be called some time after `initRedeemStable()`. Will only work if
     * the EthAnchor bridge has finished processing the deposit.
     *
     * @param idx Id of the pending redeem operation
     */
    function finishRedeemStable(uint256 idx) external onlyManager {
        (
            address operator,
            uint256 aUstAmount,
            uint256 ustAmount
        ) = _finishRedeemStable(idx);

        _swapUstToUnderlying();
        uint256 underlyingAmount = _getUnderlyingBalance();
        underlying.safeTransfer(vault, underlyingAmount);

        emit FinishRedeemStable(
            operator,
            aUstAmount,
            ustAmount,
            underlyingAmount
        );
    }

    /**
     * Amount, expressed in the underlying currency, currently in the strategy
     *
     * @notice both held and invested amounts are included here, using the
     * latest known exchange rates to the underlying currency
     * This will return value without performance fee.
     *
     * @return The total amount of underlying
     */
    function investedAssets()
        external
        view
        override(AnchorBaseStrategy)
        returns (uint256)
    {
        return
            _estimateUstAmountInUnderlying(
                pendingDeposits + _estimateAUstBalanceInUstMinusFee()
            );
    }

    /**
     * @return Underlying value of UST amount
     */
    function _estimateUstAmountInUnderlying(uint256 ustAmount)
        internal
        view
        virtual
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
            "AnchorNonUSTStrategy: invalid price"
        );
        return
            (ustAmount * uint256(ustPrice) * _underlyingDecimalsMultiplier) /
            (uint256(underlyingPrice) * _ustDecimalsMultiplier);
    }
}
