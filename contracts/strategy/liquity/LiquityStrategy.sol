// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {PercentMath} from "../../lib/PercentMath.sol";
import {ERC165Query} from "../../lib/ERC165Query.sol";
import {IStrategy} from "../IStrategy.sol";
import {CustomErrors} from "../../interfaces/CustomErrors.sol";
import {IVault} from "../../vault/IVault.sol";
import {IStabilityPool} from "../../interfaces/liquity/IStabilityPool.sol";

/***
 * Gives out LQTY & ETH as rewards
 */
contract LiquityStrategy is IStrategy, AccessControl, CustomErrors {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;
    using ERC165Query for address;

    error LiquityStabilityPoolCannotBeAddressZero();
    error StrategyYieldTokenCannotBe0Address();

    bytes32 public constant MANAGER_ROLE =
        0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08; // keccak256("MANAGER_ROLE");

    IERC20 public immutable underlying; // lusd
    /// @inheritdoc IStrategy
    address public immutable override(IStrategy) vault;
    IStabilityPool public immutable stabilityPool;
    IERC20 public immutable lqty; // reward token
    IERC20 public immutable usdc;

    constructor(
        address _vault,
        address _owner,
        address _stabilityPool,
        address _lqty,
        address _usdc,
        address _underlying
    ) {
        if (_owner == address(0)) revert StrategyOwnerCannotBe0Address();
        if (_lqty == address(0)) revert StrategyYieldTokenCannotBe0Address();
        if (_usdc == address(0)) revert StrategyYieldTokenCannotBe0Address();
        if (_stabilityPool == address(0))
            revert LiquityStabilityPoolCannotBeAddressZero();
        if (_underlying == address(0))
            revert StrategyUnderlyingCannotBe0Address();

        if (!_vault.doesContractImplementInterface(type(IVault).interfaceId))
            revert StrategyNotIVault();

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MANAGER_ROLE, _vault);
        vault = _vault;
        underlying = IERC20(_underlying);
        stabilityPool = IStabilityPool(_stabilityPool);
        lqty = IERC20(_lqty);
        usdc = IERC20(_usdc);
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
     * Returns true since strategy is synchronous.
     */
    function isSync() external pure override(IStrategy) returns (bool) {
        return true;
    }

    /// @inheritdoc IStrategy
    function hasAssets()
        external
        view
        virtual
        override(IStrategy)
        returns (bool)
    {
        return investedAssets() > 0;
    }

    /// @inheritdoc IStrategy
    /// @notice lusd deposited into strategy + lusd held by strategy + usdc held after eth/lqty=>usdc swap
    /// @dev eth & lqty rewards of the strategy in the lqty pool or withdrawn and held by the strategy are not calculated as rewards
    /// untill that eth/lqty is harvested and converted to usdc/lusd.
    function investedAssets()
        public
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        return
            stabilityPool.getCompoundedLUSDDeposit(address(this)) +
            stabilityPool.getDepositorETHGain(address(this)) +
            stabilityPool.getDepositorLQTYGain(address(this)) +
            usdc.balanceOf(address(this));
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        uint256 balance = _getUnderlyingBalance();
        if (balance == 0) revert StrategyNoUnderlying();

        stabilityPool.provideToSP(balance, address(0));

        emit StrategyInvested(balance);
    }

    /// @inheritdoc IStrategy
    function withdrawToVault(uint256 amount)
        external
        virtual
        override(IStrategy)
        onlyManager
    {
        if (amount == 0) revert StrategyAmountZero();

        if (amount > investedAssets()) revert StrategyNotEnoughShares();

        // withdraw lusd from the stabilityPool to this contract
        // this will also withdraw the unclaimed lqty & eth rewards
        stabilityPool.withdrawFromSP(amount);

        // transfer underlying to vault
        underlying.safeTransfer(vault, amount);

        emit StrategyWithdrawn(amount);
    }

    /////////////////////////////////// INTERNAL FUNCTIONS ////////////////////////////////////////////

    /**
     * Get the underlying balance of the strategy.
     *
     * @return underlying balance of the strategy
     */
    function _getUnderlyingBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }
}
