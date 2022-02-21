// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import {PercentMath} from "../../lib/PercentMath.sol";
import {ERC165Query} from "../../lib/ERC165Query.sol";
import {IVault} from "../../vault/IVault.sol";
import {IStrategy} from "../IStrategy.sol";
import {IEthAnchorRouter} from "./IEthAnchorRouter.sol";

/**
 * Base eth anchor strategy that handles UST tokens and invests them via the EthAnchor
 * protocol (https://docs.anchorprotocol.com/ethanchor/ethanchor)
 */
abstract contract AnchorBaseStrategy is IStrategy, AccessControl {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;
    using ERC165Query for address;

    event PerfFeeClaimed(uint256 amount);
    event PerfFeePctUpdated(uint256 pct);
    event InitDepositStable(
        address indexed operator,
        uint256 indexed idx,
        uint256 underlyingAmount,
        uint256 ustAmount
    );
    event FinishDepositStable(
        address indexed operator,
        uint256 ustAmount,
        uint256 aUstAmount
    );
    event InitRedeemStable(address indexed operator, uint256 aUstAmount);
    event FinishRedeemStable(
        address indexed operator,
        uint256 aUstAmount,
        uint256 ustAmount,
        uint256 underlyingAmount
    );

    struct Operation {
        address operator;
        uint256 amount;
    }

    bytes32 public constant MANAGER_ROLE =
        0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08; // keccak256("MANAGER_ROLE");

    // Underlying token address
    IERC20 public override(IStrategy) underlying;

    // Vault address
    address public override(IStrategy) vault;

    // Treasury address
    address public treasury;

    // UST token address
    IERC20 public ustToken;

    // aUST token address (wrapped Anchor UST, received to accrue interest for an Anchor deposit)
    IERC20 public aUstToken;

    // performance fee taken by the treasury on profits
    uint16 public perfFeePct;

    // Router contract to interact with EthAnchor
    IEthAnchorRouter public ethAnchorRouter;

    // Chainlink aUST / UST price feed
    AggregatorV3Interface public aUstToUstFeed;

    // amount currently pending in deposits to EthAnchor
    uint256 public pendingDeposits;

    // amount currently pending redeemption from EthAnchor
    uint256 public pendingRedeems;

    // deposit operations history
    Operation[] public depositOperations;

    // redeem operations history
    Operation[] public redeemOperations;

    // amount of UST converted (used to calculate yield)
    uint256 public convertedUst;

    // Decimals of aUST / UST feed
    uint256 internal _aUstToUstFeedDecimals;

    modifier onlyManager() {
        require(
            hasRole(MANAGER_ROLE, msg.sender),
            "AnchorBaseStrategy: caller is not manager"
        );
        _;
    }

    modifier onlyAdmin() {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "AnchorBaseStrategy: caller is not admin"
        );
        _;
    }

    /**
     * Constructor of Base Strategy - Initialize required addresses and params
     *
     * @notice Vault will be automatically set to Manager Role to handle underlyings
     *
     * @param _vault Vault address
     * @param _treasury Treasury address
     * @param _ethAnchorRouter EthAnchorRouter address
     * @param _aUstToUstFeed aUST / UST chainlink feed address
     * @param _ustToken UST token address
     * @param _aUstToken aUST token address
     * @param _perfFeePct Performance fee percentage
     * @param _owner Owner address
     */
    constructor(
        address _vault,
        address _treasury,
        address _ethAnchorRouter,
        AggregatorV3Interface _aUstToUstFeed,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        uint16 _perfFeePct,
        address _owner
    ) {
        require(_owner != address(0), "AnchorBaseStrategy: owner is 0x");
        require(
            _ethAnchorRouter != address(0),
            "AnchorBaseStrategy: router is 0x"
        );
        require(
            address(_ustToken) != address(0),
            "AnchorBaseStrategy: ust is 0x"
        );
        require(
            address(_aUstToken) != address(0),
            "AnchorBaseStrategy: aUST is 0x"
        );
        require(_treasury != address(0), "AnchorBaseStrategy: treasury is 0x");
        require(
            PercentMath.validPerc(_perfFeePct),
            "AnchorBaseStrategy: invalid performance fee"
        );
        require(
            _vault.doesContractImplementInterface(type(IVault).interfaceId),
            "AnchorBaseStrategy: not an IVault"
        );

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MANAGER_ROLE, _vault);

        treasury = _treasury;
        vault = _vault;
        underlying = IVault(_vault).underlying();
        ethAnchorRouter = IEthAnchorRouter(_ethAnchorRouter);
        aUstToUstFeed = _aUstToUstFeed;
        ustToken = _ustToken;
        aUstToken = _aUstToken;
        perfFeePct = _perfFeePct;

        _aUstToUstFeedDecimals = 10**_aUstToUstFeed.decimals();
    }

    /**
     * Invest underlying assets to EthAnchor contract.
     *
     * @notice We only deposit UST to EthAnchor. so if underlying is UST, we deposit directly,
     * however, if underlying is not UST token, then we swap underlying to UST, then deposit to ethAnchor.
     */
    function invest(bytes calldata data) external virtual;

    /**
     * Initiates available UST to EthAnchor
     *
     * @notice since EthAnchor uses an asynchronous model, this function
     * only starts the deposit process, but does not finish it.
     * Each EthAnchor deposits are handled by different operator, so we store
     * operator address to finish later.
     * We need to increase pendingDeposits to track correct underlying assets.
     */
    function _initDepositStable() internal returns (address, uint256) {
        uint256 ustBalance = _getUstBalance();
        require(ustBalance != 0, "AnchorBaseStrategy: no ust exist");
        pendingDeposits += ustBalance;

        ustToken.safeIncreaseAllowance(address(ethAnchorRouter), ustBalance);
        address operator = ethAnchorRouter.initDepositStable(ustBalance);
        depositOperations.push(
            Operation({operator: operator, amount: ustBalance})
        );

        return (operator, ustBalance);
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
        require(
            depositOperations.length > idx,
            "AnchorBaseStrategy: not running"
        );
        Operation storage operation = depositOperations[idx];
        address operator = operation.operator;
        uint256 aUstBalanceBefore = _getAUstBalance();

        ethAnchorRouter.finishDepositStable(operator);
        uint256 newAUst = _getAUstBalance() - aUstBalanceBefore;
        require(newAUst > 0, "AnchorBaseStrategy: no aUST returned");

        uint256 ustAmount = operation.amount;
        pendingDeposits -= ustAmount;
        convertedUst += ustAmount;

        emit FinishDepositStable(operator, ustAmount, newAUst);

        if (idx < depositOperations.length - 1) {
            Operation memory lastOperation = depositOperations[
                depositOperations.length - 1
            ];
            operation.operator = lastOperation.operator;
            operation.amount = lastOperation.amount;
        }

        depositOperations.pop();
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
        require(amount != 0, "AnchorBaseStrategy: amount 0");
        pendingRedeems += amount;

        aUstToken.safeIncreaseAllowance(address(ethAnchorRouter), amount);
        address operator = ethAnchorRouter.initRedeemStable(amount);

        redeemOperations.push(Operation({operator: operator, amount: amount}));

        emit InitRedeemStable(operator, amount);
    }

    /**
     * Request withdrawal from EthAnchor
     *
     * @notice since EthAnchor uses an asynchronous model, we can only request withdrawal for whole aUST
     */
    function withdrawAllToVault() external override(IStrategy) onlyManager {
        uint256 aUstBalance = _getAUstBalance();
        if (aUstBalance != 0) {
            initRedeemStable(aUstBalance);
        }
    }

    /**
     * Withdraws a specified amount back to the vault
     *
     * @notice since EthAnchor uses an asynchronous model, and there is no underlying amount
     * in the strategy, this function do nothing at all, However override interface of IStrategy.
     */
    function withdrawToVault(uint256 amount)
        external
        override(IStrategy)
        onlyManager
    {}

    /**
     * Updates the performance fee
     *
     * @notice Can only be called by governance
     *
     * @param _perfFeePct The new performance fee %
     */
    function setPerfFeePct(uint16 _perfFeePct) external onlyAdmin {
        require(
            PercentMath.validPerc(_perfFeePct),
            "AnchorBaseStrategy: invalid performance fee"
        );
        perfFeePct = _perfFeePct;
        emit PerfFeePctUpdated(_perfFeePct);
    }

    /// See {IStrategy}
    function applyInvestmentFee(uint256 _amount)
        external
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        return _amount.percOf(9800);
    }

    /**
     * Amount, expressed in the underlying currency, currently in the strategy
     *
     * @notice both held and invested amounts are included here, using the
     * latest known exchange rates to the underlying currency.
     * This will return value without performance fee.
     *
     * @return The total amount of underlying
     */
    function investedAssets()
        external
        view
        virtual
        override(IStrategy)
        returns (uint256);

    /**
     * Calls EthAnchor with a pending redeem ID, and attempts to finish it.
     *
     * @notice Must be called some time after `initRedeemStable()`. Will only work if
     * the EthAnchor bridge has finished processing the deposit.
     * Will take performance fee if some yield generated.
     *
     * @dev division by `aUstBalance` was not deemed worthy of a zero-check
     *   (https://github.com/code-423n4/2022-01-sandclock-findings/issues/95)
     *
     * @param idx Id of the pending redeem operation
     *
     * @return Redeemed UST amount without performance fee.
     */
    function _finishRedeemStable(uint256 idx)
        internal
        returns (
            address,
            uint256,
            uint256
        )
    {
        require(
            redeemOperations.length > idx,
            "AnchorBaseStrategy: not running"
        );
        Operation storage operation = redeemOperations[idx];
        uint256 aUstBalance = _getAUstBalance() + pendingRedeems;

        uint256 operationAmount = operation.amount;
        address operator = operation.operator;
        uint256 originalUst = (convertedUst * operationAmount) / aUstBalance;

        ethAnchorRouter.finishRedeemStable(operator);

        uint256 redeemedAmount = _getUstBalance();
        require(redeemedAmount > 0, "AnchorBaseStrategy: nothing redeemed");

        uint256 perfFee = redeemedAmount > originalUst
            ? (redeemedAmount - originalUst).percOf(perfFeePct)
            : 0;
        if (perfFee != 0) {
            ustToken.safeTransfer(treasury, perfFee);
            emit PerfFeeClaimed(perfFee);
        }
        convertedUst -= originalUst;
        pendingRedeems -= operationAmount;

        if (idx < redeemOperations.length - 1) {
            Operation memory lastOperation = redeemOperations[
                redeemOperations.length - 1
            ];
            operation.operator = lastOperation.operator;
            operation.amount = lastOperation.amount;
        }
        redeemOperations.pop();

        return (operator, operationAmount, redeemedAmount - perfFee);
    }

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
        return ustToken.balanceOf(address(this));
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

    /**
     * Calculate performance fee for known aUST balance and aUST / UST exchange rate.
     *
     * @return performance fee in UST.
     */
    function _performanceUstFeeWithInfo(uint256 aUstBalance, uint256 price)
        private
        view
        returns (uint256)
    {
        // aUST and UST decimals are same, so we only care about aUST / UST feed decimals
        uint256 estimatedUstAmount = (price * aUstBalance) /
            _aUstToUstFeedDecimals;
        if (estimatedUstAmount > convertedUst) {
            return (estimatedUstAmount - convertedUst).percOf(perfFeePct);
        }
        return 0;
    }

    /**
     * Calculate current performance fee amount
     *
     * @notice Performance fee is in UST
     *
     * @return current performance fee
     */
    function currentPerformanceFee() external view returns (uint256) {
        if (convertedUst == 0) {
            return 0;
        }

        uint256 aUstBalance = _getAUstBalance() + pendingRedeems;

        return _performanceUstFeeWithInfo(aUstBalance, _aUstExchangeRate());
    }

    /**
     * @return UST value of current aUST balance (+ pending redeems) without performance fee
     */
    function _estimateAUstBalanceInUstMinusFee()
        internal
        view
        returns (uint256)
    {
        uint256 aUstBalance = _getAUstBalance() + pendingRedeems;

        if (aUstBalance == 0) {
            return 0;
        }

        uint256 aUstPrice = _aUstExchangeRate();

        return
            ((aUstPrice * aUstBalance) / _aUstToUstFeedDecimals) -
            _performanceUstFeeWithInfo(aUstBalance, aUstPrice);
    }

    /**
     * @return aUST / UST exchange rate from chainlink
     */
    function _aUstExchangeRate() internal view virtual returns (uint256) {
        (
            uint80 roundID,
            int256 price,
            ,
            uint256 updateTime,
            uint80 answeredInRound
        ) = aUstToUstFeed.latestRoundData();

        require(
            price > 0 && updateTime != 0 && answeredInRound >= roundID,
            "AnchorBaseStrategy: invalid aUST rate"
        );

        return uint256(price);
    }
}
