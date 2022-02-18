// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {PercentMath} from "../lib/PercentMath.sol";
import {ERC165Query} from "../lib/ERC165Query.sol";
import {IVault} from "../vault/IVault.sol";
import {IStrategy} from "./IStrategy.sol";
import {IEthAnchorRouter} from "./anchor/IEthAnchorRouter.sol";
import {IExchangeRateFeeder} from "./anchor/IExchangeRateFeeder.sol";

/**
 * Base strategy that handles UST tokens and invests them via the EthAnchor
 * protocol (https://docs.anchorprotocol.com/ethanchor/ethanchor)
 */
abstract contract BaseStrategy is IStrategy, AccessControl {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;
    using ERC165Query for address;

    event PerfFeeClaimed(uint256 amount);
    event PerfFeePctUpdated(uint256 pct);
    event ExchangeRateFeederUpdated(address indexed exchangeRateFeeder);

    struct Operation {
        address operator;
        uint256 amount;
    }

    bytes32 public constant MANAGER_ROLE =
        0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08; // keccak256("MANAGER_ROLE");

    IERC20 public override(IStrategy) underlying;
    // Vault address
    address public override(IStrategy) vault;

    // address of the treasury
    address public treasury;

    // address for the UST token
    IERC20 public ustToken;

    // address for the aUST token (wrapped Anchor UST, received to accrue interest for an Anchor deposit)
    IERC20 public aUstToken;

    // performance fee taken by the treasury on profits
    uint16 public perfFeePct;

    // external contract to interact with EthAnchor
    IEthAnchorRouter public ethAnchorRouter;

    // external exchange rate provider
    IExchangeRateFeeder public exchangeRateFeeder;

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

    modifier onlyManager() {
        require(
            hasRole(MANAGER_ROLE, msg.sender),
            "BaseStrategy: caller is not manager"
        );
        _;
    }

    modifier onlyAdmin() {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "BaseStrategy: caller is not admin"
        );
        _;
    }

    constructor(
        address _vault,
        address _treasury,
        address _ethAnchorRouter,
        address _exchangeRateFeeder,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        uint16 _perfFeePct,
        address _owner
    ) {
        require(_ethAnchorRouter != address(0), "0x addr: _ethAnchorRouter");
        require(
            _exchangeRateFeeder != address(0),
            "0 addr: _exchangeRateFeeder"
        );
        require(address(_ustToken) != address(0), "0 addr: _usdToken");
        require(address(_aUstToken) != address(0), "0x addr: _aUstToken");
        require(PercentMath.validPerc(_perfFeePct), "invalid pct");
        require(_treasury != address(0), "0 addr: _treasury");
        require(
            _vault.doesContractImplementInterface(type(IVault).interfaceId),
            "_vault: not an IVault"
        );

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MANAGER_ROLE, _vault);

        treasury = _treasury;
        vault = _vault;
        underlying = IVault(_vault).underlying();
        ethAnchorRouter = IEthAnchorRouter(_ethAnchorRouter);
        exchangeRateFeeder = IExchangeRateFeeder(_exchangeRateFeeder);
        ustToken = _ustToken;
        aUstToken = _aUstToken;
        perfFeePct = _perfFeePct;

        // pre-approve EthAnchor router to transact all UST and aUST
        ustToken.safeIncreaseAllowance(_ethAnchorRouter, type(uint256).max);
        aUstToken.safeIncreaseAllowance(_ethAnchorRouter, type(uint256).max);
    }

    function setExchangeRateFeeder(address _exchangeRateFeeder)
        external
        onlyAdmin
    {
        require(_exchangeRateFeeder != address(0), "0x addr");
        exchangeRateFeeder = IExchangeRateFeeder(_exchangeRateFeeder);

        emit ExchangeRateFeederUpdated(_exchangeRateFeeder);
    }

    /**
     * Initiates a deposit of all the currently held UST into EthAnchor
     *
     * @notice since EthAnchor uses an asynchronous model, this function
     * only starts the deposit process, but does not finish it.
     */
    function doHardWork() external virtual;

    function _initDepositStable() internal {
        uint256 ustBalance = _getUstBalance();
        require(ustBalance != 0, "balance 0");
        pendingDeposits += ustBalance;
        address _operator = ethAnchorRouter.initDepositStable(ustBalance);
        depositOperations.push(
            Operation({operator: _operator, amount: ustBalance})
        );
    }

    /**
     * Calls EthAnchor with a pending deposit ID, and attempts to finish it.
     *
     * @notice Must be called some time after `doHardWork()`. Will only work if
     * the EthAnchor bridge has finished processing the deposit.
     *
     * @param idx Id of the pending deposit operation
     */
    function finishDepositStable(uint256 idx) external onlyManager {
        require(depositOperations.length > idx, "not running");
        Operation storage operation = depositOperations[idx];
        ethAnchorRouter.finishDepositStable(operation.operator);

        pendingDeposits -= operation.amount;
        convertedUst += operation.amount;

        operation.operator = depositOperations[depositOperations.length - 1]
            .operator;
        operation.amount = depositOperations[depositOperations.length - 1]
            .amount;
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
        uint256 aUstBalance = _getAUstBalance();
        require(amount != 0, "amount 0");
        require(aUstBalance >= amount, "insufficient");
        pendingRedeems += amount;
        address _operator = ethAnchorRouter.initRedeemStable(amount);
        redeemOperations.push(Operation({operator: _operator, amount: amount}));
    }

    /**
     * Withdraws the entire amount back to the vault
     *
     * @notice since some of the amount may be deposited into EthAnchor, this
     * call may not withdraw all the funds right away. It will start a redeem
     * process on EthAnchor, but this function must be called again a second
     * time once that is finished.
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
     * @notice this function only considers the
     * amount currently not invested, but only what is currently held by the
     * strategy
     *
     * @param amount Amount to withdraw
     */
    function withdrawToVault(uint256 amount)
        external
        override(IStrategy)
        onlyManager
    {
        underlying.safeTransfer(vault, amount);
    }

    /**
     * Updates the performance fee
     *
     * @notice Can only be called by governance
     *
     * @param _perfFeePct The new performance fee %
     */
    function setPerfFeePct(uint16 _perfFeePct) external onlyAdmin {
        require(PercentMath.validPerc(_perfFeePct), "invalid pct");
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
     * latest known exchange rates to the underlying currency
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
     *
     * @param idx Id of the pending redeem operation
     *
     * @dev division by `aUstBalance` was not deemed worthy of a zero-check
     *   (https://github.com/code-423n4/2022-01-sandclock-findings/issues/95)
     */
    function _finishRedeemStable(uint256 idx) internal returns (uint256) {
        require(redeemOperations.length > idx, "not running");
        Operation storage operation = redeemOperations[idx];
        uint256 aUstBalance = _getAUstBalance() + pendingRedeems;
        uint256 originalUst = (convertedUst * operation.amount) / aUstBalance;

        ethAnchorRouter.finishRedeemStable(operation.operator);

        uint256 redeemedAmount = _getUstBalance();
        uint256 perfFee = redeemedAmount > originalUst
            ? (redeemedAmount - originalUst).percOf(perfFeePct)
            : 0;
        if (perfFee != 0) {
            ustToken.safeTransfer(treasury, perfFee);
            emit PerfFeeClaimed(perfFee);
        }
        convertedUst -= originalUst;
        pendingRedeems -= operation.amount;

        operation.operator = redeemOperations[redeemOperations.length - 1]
            .operator;
        operation.amount = redeemOperations[redeemOperations.length - 1].amount;
        redeemOperations.pop();

        return redeemedAmount - perfFee;
    }

    // Amount of underlying tokens in the strategy
    function _getUnderlyingBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    // Amount of UST tokens in the strategy
    function _getUstBalance() internal view returns (uint256) {
        return ustToken.balanceOf(address(this));
    }

    // Amount of aUST tokens in the strategy
    function _getAUstBalance() internal view returns (uint256) {
        return aUstToken.balanceOf(address(this));
    }

    // Amount of pending deposit operations
    function depositOperationLength() external view returns (uint256) {
        return depositOperations.length;
    }

    // Amount of pending redeem operations
    function redeemOperationLength() external view returns (uint256) {
        return redeemOperations.length;
    }

    // Calculate performance fee in UST with aUST balance and exchange rate
    function _performanceUstFeeWithInfo(
        uint256 aUstBalance,
        uint256 exchangeRate
    ) private view returns (uint256) {
        uint256 estimatedUstAmount = (exchangeRate * aUstBalance) / 1e18;
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

        return
            _performanceUstFeeWithInfo(
                aUstBalance,
                exchangeRateFeeder.exchangeRateOf(address(ustToken), true)
            );
    }

    // Get UST value of current aUST balance
    function _estimateAUstBalanceInUstMinusFee()
        internal
        view
        returns (uint256)
    {
        uint256 aUstBalance = _getAUstBalance() + pendingRedeems;

        if (aUstBalance == 0) {
            return 0;
        }

        uint256 exchangeRate = exchangeRateFeeder.exchangeRateOf(
            address(ustToken),
            true
        );

        return
            ((exchangeRate * aUstBalance) / 1e18) -
            _performanceUstFeeWithInfo(aUstBalance, exchangeRate);
    }
}
