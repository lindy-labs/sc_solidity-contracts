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
import {CustomErrors} from "../../interfaces/CustomErrors.sol";

/**
 * Base eth anchor strategy that handles UST tokens and invests them via the EthAnchor
 * protocol (https://docs.anchorprotocol.com/ethanchor/ethanchor)
 */
contract AnchorStrategy is IStrategy, AccessControl, CustomErrors {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;
    using ERC165Query for address;

    bytes32 public constant MANAGER_ROLE =
        0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08; // keccak256("MANAGER_ROLE");

    /// @inheritdoc IStrategy
    address public immutable override(IStrategy) vault;

    // UST token address
    IERC20 public immutable ustToken;

    // aUST token address (wrapped Anchor UST, received to accrue interest for an Anchor deposit)
    IERC20 public immutable aUstToken;

    // Chainlink aUST / UST price feed
    AggregatorV3Interface public immutable aUstToUstFeed;

    // Multiplier of aUST / UST feed
    uint256 internal _aUstToUstFeedMultiplier;

    bool internal _allRedeemed;

    /**
     * Constructor of Base Strategy - Initialize required addresses and params
     *
     * @notice Vault will be automatically set to Manager Role to handle underlyings
     *
     * @param _vault Vault address
     * @param _aUstToUstFeed aUST / UST chainlink feed address
     * @param _ustToken UST token address
     * @param _aUstToken aUST token address
     * @param _owner Owner address
     */
    constructor(
        address _vault,
        AggregatorV3Interface _aUstToUstFeed,
        IERC20 _ustToken,
        IERC20 _aUstToken,
        address _owner
    ) {
        if (_owner == address(0)) revert StrategyOwnerCannotBe0Address();
        if (address(_ustToken) == address(0))
            revert StrategyUnderlyingCannotBe0Address();
        if (address(_aUstToken) == address(0))
            revert StrategyYieldTokenCannotBe0Address();
        if (!_vault.doesContractImplementInterface(type(IVault).interfaceId))
            revert StrategyNotIVault();

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MANAGER_ROLE, _vault);

        vault = _vault;
        aUstToUstFeed = _aUstToUstFeed;
        ustToken = _ustToken;
        aUstToken = _aUstToken;

        _aUstToUstFeedMultiplier = 10**_aUstToUstFeed.decimals();
        _allRedeemed = true;
    }

    //
    // Modifiers
    //

    modifier onlyManager() {
        if (!hasRole(MANAGER_ROLE, msg.sender))
            revert StrategyCallerNotManager();
        _;
    }

    //
    // IStrategy
    //

    /**
     * Request withdrawal from EthAnchor
     *
     * @notice since EthAnchor uses an asynchronous model, we can only request withdrawal for whole aUST
     */
    function withdrawAllToVault() external override(IStrategy) onlyManager {}

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
        return 0;
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {}

    /// @inheritdoc IStrategy
    function hasAssets() external view override returns (bool) {
        return true;
    }

    //
    // Internal API
    //

    /**
     * @return underlying balance of strategy
     */
    function _getUnderlyingBalance() internal view returns (uint256) {
        return ustToken.balanceOf(address(this));
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
        return 0;
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
