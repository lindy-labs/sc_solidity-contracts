// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import {PercentMath} from "../../lib/PercentMath.sol";
import {ERC165Query} from "../../lib/ERC165Query.sol";
import {IVault} from "../../vault/IVault.sol";
import {IAnchorStrategy} from "./IAnchorStrategy.sol";
import {IStrategy} from "../../strategy/IStrategy.sol";
import {BaseStrategy} from "../../strategy/BaseStrategy.sol";
import {IEthAnchorRouter} from "./IEthAnchorRouter.sol";
import {CustomErrors} from "../../interfaces/CustomErrors.sol";

/**
 * Base eth anchor strategy that handles UST tokens and invests them via the EthAnchor
 * protocol (https://docs.anchorprotocol.com/ethanchor/ethanchor)
 */
contract AnchorStrategy is IAnchorStrategy, BaseStrategy {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;

    // AnchorStrategy: no ust exist
    error StrategyNoUST();
    // AnchorStrategy: no aUST returned
    error StrategyNoAUSTReturned();
    // AnchorStrategy: nothing redeemed
    error StrategyNothingRedeemed();
    // AnchorStrategy: invalid aUST rate
    error StrategyInvalidAUSTRate();
    // AnchorStrategy: router is 0x
    error StrategyRouterCannotBe0Address();
    // AnchorStrategy: yield token is 0x
    error StrategyYieldTokenCannotBe0Address();

    // aUST token address (wrapped Anchor UST, received to accrue interest for an Anchor deposit)
    IERC20 public immutable aUstToken;

    // Router contract to interact with EthAnchor
    IEthAnchorRouter public ethAnchorRouter;

    // Chainlink aUST / UST price feed
    AggregatorV3Interface public immutable aUstToUstFeed;

    // amount currently pending in deposits to EthAnchor
    uint256 public pendingDeposits;

    // amount currently pending redeemption from EthAnchor
    uint256 public pendingRedeems;

    // deposit operations history
    Operation[] public depositOperations;

    // redeem operations history
    Operation[] public redeemOperations;

    // Multiplier of aUST / UST feed
    uint256 internal _aUstToUstFeedMultiplier;

    bool internal _allRedeemed;

    /**
     * Constructor of Base Strategy - Initialize required addresses and params
     *
     * @notice Vault will be automatically set to Manager Role to handle underlyings
     *
     * @param _vault Vault address
     * @param _ethAnchorRouter EthAnchorRouter address
     * @param _aUstToUstFeed aUST / UST chainlink feed address
     * @param _ustToken UST token address
     * @param _aUstToken aUST token address
     * @param _admin admin address
     */
    constructor(
        address _vault,
        address _ethAnchorRouter,
        AggregatorV3Interface _aUstToUstFeed,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        address _admin
    ) BaseStrategy(_vault, address(_ustToken), _admin) {
        if (_ethAnchorRouter == address(0))
            revert StrategyRouterCannotBe0Address();
        if (address(_aUstToken) == address(0))
            revert StrategyYieldTokenCannotBe0Address();

        ethAnchorRouter = IEthAnchorRouter(_ethAnchorRouter);
        aUstToUstFeed = _aUstToUstFeed;
        aUstToken = _aUstToken;

        _aUstToUstFeedMultiplier = 10**_aUstToUstFeed.decimals();
        _allRedeemed = true;
    }

    //
    // IStrategy
    //

    /**
     * Returns false since strategy is asynchronous.
     */
    function isSync() external pure override(IStrategy) returns (bool) {
        return false;
    }

    /**
     * Withdraws a specified amount back to the vault
     *
     * @notice since EthAnchor uses an asynchronous model, and there is no underlying amount
     * in the strategy, this function do nothing at all, However override interface of IStrategy.
     */
    function withdrawToVault(uint256 amount)
        external
        virtual
        override(IStrategy)
        onlyManager
    {
        if (amount == 0) revert StrategyAmountZero();
        uint256 _aUstToWithdraw = _estimateUstAmountInAUst(amount);

        if (pendingRedeems < _aUstToWithdraw) {
            initRedeemStable(_aUstToWithdraw - pendingRedeems);
        }
    }

    /**
     * Amount, expressed in the underlying currency, currently in the strategy
     *
     * @notice both held and invested amounts are included here, using the
     * latest known exchange rates to the underlying currency.
     *
     * @return The total amount of underlying
     */
    function investedAssets()
        external
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        return pendingDeposits + _estimateAUstBalanceInUst();
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        uint256 ustBalance = _getUstBalance();
        if (ustBalance == 0) revert StrategyNoUST();
        pendingDeposits += ustBalance;

        underlying.safeIncreaseAllowance(address(ethAnchorRouter), ustBalance);
        address operator = ethAnchorRouter.initDepositStable(ustBalance);
        depositOperations.push(
            Operation({operator: operator, amount: ustBalance})
        );

        _allRedeemed = false;

        emit InitDepositStable(
            operator,
            depositOperations.length - 1,
            ustBalance,
            ustBalance
        );
    }

    /**
     * Calls EthAnchor with a pending deposit ID, and attempts to finish it.
     *
     * @notice Must be called some time after `_initDepositStable()`. Will only work if
     * the EthAnchor bridge has finished processing the deposit.
     *
     * @param idx Id of the pending deposit operation
     */
    function finishDepositStable(uint256 idx) external onlyManager {
        if (depositOperations.length <= idx) revert StrategyNotRunning();
        Operation storage operation = depositOperations[idx];
        address operator = operation.operator;
        uint256 aUstBalanceBefore = _getAUstBalance();

        ethAnchorRouter.finishDepositStable(operator);
        uint256 newAUst = _getAUstBalance() - aUstBalanceBefore;
        if (newAUst == 0) revert StrategyNoAUSTReturned();

        uint256 ustAmount = operation.amount;
        pendingDeposits -= ustAmount;

        if (idx < depositOperations.length - 1) {
            Operation memory lastOperation = depositOperations[
                depositOperations.length - 1
            ];

            emit RearrangeDepositOperation(
                lastOperation.operator,
                operation.operator,
                idx
            );

            operation.operator = lastOperation.operator;
            operation.amount = lastOperation.amount;
        }

        depositOperations.pop();

        emit FinishDepositStable(operator, ustAmount, newAUst);
    }

    /**
     * Initiates a withdrawal of UST from EthAnchor
     *
     * @notice since EthAnchor uses an asynchronous model, this function
     * only starts the redeem process, but does not finish it.
     *
     * @param amount Amount of aUST to redeem
     */
    function initRedeemStable(uint256 amount) public onlyManager {
        if (amount == 0) revert StrategyAmountZero();
        if (pendingDeposits == 0 && _getAUstBalance() == amount) {
            _allRedeemed = true;
        }
        pendingRedeems += amount;

        aUstToken.safeIncreaseAllowance(address(ethAnchorRouter), amount);
        address operator = ethAnchorRouter.initRedeemStable(amount);

        redeemOperations.push(Operation({operator: operator, amount: amount}));

        emit InitRedeemStable(operator, redeemOperations.length - 1, amount);
    }

    /**
     * Calls EthAnchor with a pending redeem ID, and attempts to finish it.
     *
     * @notice Must be called some time after `initRedeemStable()`. Will only work if
     * the EthAnchor bridge has finished processing the deposit.
     *
     * @dev division by `aUstBalance` was not deemed worthy of a zero-check
     *   (https://github.com/code-423n4/2022-01-sandclock-findings/issues/95)
     *
     * @param idx Id of the pending redeem operation
     */
    function finishRedeemStable(uint256 idx) external virtual onlyManager {
        if (redeemOperations.length <= idx) revert StrategyNotRunning();
        Operation storage operation = redeemOperations[idx];

        uint256 aUstAmount = operation.amount;
        address operator = operation.operator;

        ethAnchorRouter.finishRedeemStable(operator);

        uint256 ustAmount = _getUstBalance();
        if (ustAmount == 0) revert StrategyNothingRedeemed();

        pendingRedeems -= aUstAmount;

        if (idx < redeemOperations.length - 1) {
            Operation memory lastOperation = redeemOperations[
                redeemOperations.length - 1
            ];

            emit RearrangeRedeemOperation(
                lastOperation.operator,
                operation.operator,
                idx
            );

            operation.operator = lastOperation.operator;
            operation.amount = lastOperation.amount;
        }

        redeemOperations.pop();

        underlying.safeTransfer(vault, _getUnderlyingBalance());

        emit FinishRedeemStable(operator, aUstAmount, ustAmount, ustAmount);
    }

    /// @inheritdoc IStrategy
    function hasAssets() external view override returns (bool) {
        return _allRedeemed == false || pendingRedeems != 0;
    }

    //
    // Internal API
    //

    /**
     * @return underlying balance of strategy
     */
    function _getUnderlyingBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    /**
     * @return UST balance of strategy
     */
    function _getUstBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    /**
     * @return aUST balance of strategy
     */
    function _getAUstBalance() internal view returns (uint256) {
        return aUstToken.balanceOf(address(this));
    }

    /**
     * @return Length of pending deposit operations
     */
    function depositOperationLength() external view returns (uint256) {
        return depositOperations.length;
    }

    /**
     * @return Length of pending redeem operations
     */
    function redeemOperationLength() external view returns (uint256) {
        return redeemOperations.length;
    }

    /// @inheritdoc BaseStrategy
    function transferAdminRights(address newAdmin)
        external
        override(BaseStrategy)
        onlyManager
    {}

    /**
     * @return AUST value of UST amount
     */
    function _estimateUstAmountInAUst(uint256 ustAmount)
        internal
        view
        returns (uint256)
    {
        if (ustAmount == 0) {
            return 0;
        }

        uint256 aUstPrice = _aUstToUstExchangeRate();

        return ((_aUstToUstFeedMultiplier * ustAmount) / aUstPrice);
    }

    /**
     * @return UST value of current aUST balance (+ pending redeems)
     */
    function _estimateAUstBalanceInUst() internal view returns (uint256) {
        uint256 aUstBalance = _getAUstBalance() + pendingRedeems;

        if (aUstBalance == 0) {
            return 0;
        }

        uint256 aUstPrice = _aUstToUstExchangeRate();

        return ((aUstPrice * aUstBalance) / _aUstToUstFeedMultiplier);
    }

    /**
     * @return aUST / UST exchange rate from chainlink
     */
    function _aUstToUstExchangeRate() internal view virtual returns (uint256) {
        (
            uint80 roundID,
            int256 price,
            ,
            uint256 updateTime,
            uint80 answeredInRound
        ) = aUstToUstFeed.latestRoundData();

        if (price <= 0 || updateTime == 0 || answeredInRound < roundID)
            revert StrategyInvalidAUSTRate();

        return uint256(price);
    }
}
