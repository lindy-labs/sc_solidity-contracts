// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {weth9} from "../../interfaces/weth9.sol";
import {PercentMath} from "../../lib/PercentMath.sol";
import {ERC165Query} from "../../lib/ERC165Query.sol";
import {IStrategy} from "../IStrategy.sol";
import {CustomErrors} from "../../interfaces/CustomErrors.sol";
import {IVault} from "../../vault/IVault.sol";
import {IStabilityPool} from "../../interfaces/liquity/IStabilityPool.sol";
import {ICurveRouter} from "../../interfaces/curve/ICurveRouter.sol";

// TODO:
// Use oracles to convert ETH, LQTY and USDC to LUSD and update the investedAssets method calculating everything in LUSD terms
// Update the withdraw method to check for ETH, LQTY, USDC balance (and swap them to LUSD) in case the LUSD balance is not enough

/***
 * Gives out LQTY & ETH as rewards
 The strategy must run in epochs
 Deposits & withdrawals will only be opened for a small time (1 - 3 hrs) every week
 Then paused
 Before the opening of the epoch all ETH, LQTY held by the contract must be converted to LUSD
 (USDC held by the contract can be held for as long as possible since the investedAssets method is calculating USDC balance)
 Also the opening period must be small, because since we are not calculating the reward tokens in the investedAssets method
 so during the opening period if a user withdraws then the rewards that he accrues during the opening period are not given to him
 for example, suppose we open withdrwals at 8:00 pm and the user withdraws at 9:00 pm then the rewards accrued by his deposits during
 the time interval from 8 to 9 pm (that small 1 hr) wont be recieved to him (This is also same for any liquidations that happen from 8 to 9 pm)
 */
contract LiquityStrategy is IStrategy, AccessControl, CustomErrors {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;
    using ERC165Query for address;

    error LiquityStabilityPoolCannotBeAddressZero();
    error StrategyYieldTokenCannotBe0Address();

    bytes32 public constant MANAGER_ROLE =
        0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08; // keccak256("MANAGER_ROLE");

    address public immutable underlying; // lusd
    /// @inheritdoc IStrategy
    address public immutable override(IStrategy) vault;
    IStabilityPool public immutable stabilityPool;
    address public immutable lqty; // reward token
    address public immutable usdc;
    address public immutable weth;

    ICurveRouter public curveRouter;
    address public curveLusdPool;

    constructor(
        address _vault,
        address _owner,
        address _stabilityPool,
        address _lqty,
        address _usdc,
        address _weth,
        address _underlying,
        address _curveRouter,
        address _curveLusdPool
    ) {
        if (_owner == address(0)) revert StrategyOwnerCannotBe0Address();
        if (_lqty == address(0)) revert StrategyYieldTokenCannotBe0Address();
        if (_usdc == address(0)) revert StrategyYieldTokenCannotBe0Address();
        if (_weth == address(0)) revert StrategyYieldTokenCannotBe0Address();
        if (_stabilityPool == address(0))
            revert LiquityStabilityPoolCannotBeAddressZero();
        if (_underlying == address(0))
            revert StrategyUnderlyingCannotBe0Address();

        if (!_vault.doesContractImplementInterface(type(IVault).interfaceId))
            revert StrategyNotIVault();

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MANAGER_ROLE, _vault);
        vault = _vault;
        underlying = _underlying;
        stabilityPool = IStabilityPool(_stabilityPool);
        lqty = _lqty;
        usdc = _usdc;
        weth = _weth;

        // no need extra checks for these, since if these are wrong then the investedAssets method would revert automatically
        curveRouter = ICurveRouter(_curveRouter);
        curveLusdPool = _curveLusdPool;

        IERC20(underlying).approve(_stabilityPool, type(uint256).max);
    }

    //
    // Modifiers
    //

    modifier onlyManager() {
        if (!hasRole(MANAGER_ROLE, msg.sender))
            revert StrategyCallerNotManager();
        _;
    }

    modifier onlyOwner() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender))
            revert StrategyCallerNotOwner();
        _;
    }

    //
    // IStrategy
    //

    /**
     * Transfers ownership of the Strategy to another account,
     * revoking previous owner's ADMIN role and setting up ADMIN role for the new owner.
     *
     * @notice Can only be called by the current owner.
     *
     * @param _newOwner The new owner of the contract.
     */
    function transferOwnership(address _newOwner) public onlyOwner {
        if (_newOwner == address(0x0)) revert StrategyOwnerCannotBe0Address();
        if (_newOwner == msg.sender)
            revert StrategyCannotTransferOwnershipToSelf();

        _setupRole(DEFAULT_ADMIN_ROLE, _newOwner);

        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

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
            // lusd deposited into liquity's stability pool
            stabilityPool.getCompoundedLUSDDeposit(address(this)) +
            // lusd held by this contract
            IERC20(underlying).balanceOf(address(this)) +
            // usdc held by this contract in lusd denomination
            curveRouter.get_exchange_amount(
                curveLusdPool,
                usdc,
                underlying,
                IERC20(usdc).balanceOf(address(this))
            );
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
        IERC20(underlying).safeTransfer(vault, amount);

        emit StrategyWithdrawn(amount);
    }

    /**
        swaps the ETH & LQTY rewards from the stability pool into usdc
     */
    function harvest(
        address _swapTarget,
        bytes calldata _lqtySwapData,
        bytes calldata _ethSwapData
    ) external payable onlyOwner {
        // withdraw rewards from Liquity Stability Pool Contract
        stabilityPool.withdrawFromSP(0);

        // calculate rewards
        uint256 lqtyRewards = IERC20(lqty).balanceOf(address(this));
        uint256 ethRewards = address(this).balance;

        // give out approvals to the swapTarget
        IERC20(lqty).safeApprove(_swapTarget, lqtyRewards);

        bool success;
        if (lqtyRewards > 0) {
            // swap LQTY to USDC
            (success, ) = _swapTarget.call{value: msg.value}(_lqtySwapData);
            require(success, "LQTY_SWAP_CALL_FAILED");
        }

        // swap ETH to usdc
        // todo: double check in the tests if we are getting ETH or WETH from stability pool
        if (ethRewards > 0) {
            (success, ) = _swapTarget.call{value: msg.value}(_ethSwapData);
            require(success, "ETH_SWAP_CALL_FAILED");
        }
    }

    /**
        @notice swaps all the given fromtoken balance inside the contract to the toToken (coming from the 0xapi data)
        supposed to be used by the backend to swap the usdc held by the contract to lusd
        but can be used for other swaps too
     */
    function swap(
        address _fromToken,
        uint256 _amount,
        address _swapTarget,
        bytes calldata _swapData
    ) external payable onlyOwner {
        IERC20(_fromToken).approve(_swapTarget, _amount);
        (bool success, ) = _swapTarget.call{value: msg.value}(_swapData);
        require(success, "SWAP_CALL_FAILED");
    }

    /**
        @notice set the curve router address and the curve lusd pool address
     */
    function setCurveRouterAndPool(address _curveRouter, address _curveLusdPool)
        external
        onlyOwner
    {
        curveRouter = ICurveRouter(_curveRouter);
        curveLusdPool = _curveLusdPool;
    }

    /////////////////////////////////// INTERNAL FUNCTIONS ////////////////////////////////////////////

    /**
     * Get the underlying balance of the strategy.
     *
     * @return underlying balance of the strategy
     */
    function _getUnderlyingBalance() internal view returns (uint256) {
        return IERC20(underlying).balanceOf(address(this));
    }
}

// the only problem is when withdrawals take place then in the case of a full withdrawal where somebody wants to withdraw all funds
// we may have problems if all our funds are not in lusd. If there are still funds in eth, lqty or usdc.
// then we need to add clauses in the withdraw which will convert eth/lqty/usdc to lusd in such scenarios and then withdraw the lusd.

// we can allow withdrawals anytime if the user is ready to take a loss
// the vault deposits to the strategy anyway, so we can just deposit to the strategy when we want
// call the harvest method from the vault before the invest method
