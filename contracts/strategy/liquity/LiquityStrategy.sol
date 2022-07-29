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
    error SwapCallFailed(address fromToken);

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    IERC20 public immutable underlying; // lusd
    /// @inheritdoc IStrategy
    address public immutable override(IStrategy) vault;
    IStabilityPool public immutable stabilityPool;
    IERC20 public immutable lqty; // reward token
    IERC20 public immutable usdc;

    ICurveRouter public curveRouter;
    address public curveLusdPool;

    constructor(
        address _vault,
        address _admin,
        address _stabilityPool,
        address _lqty,
        address _usdc,
        address _underlying,
        address _curveRouter,
        address _curveLusdPool
    ) {
        if (_admin == address(0)) revert StrategyOwnerCannotBe0Address();
        if (_lqty == address(0)) revert StrategyYieldTokenCannotBe0Address();
        if (_usdc == address(0)) revert StrategyYieldTokenCannotBe0Address();
        if (_stabilityPool == address(0))
            revert LiquityStabilityPoolCannotBeAddressZero();
        if (_underlying == address(0))
            revert StrategyUnderlyingCannotBe0Address();

        if (!_vault.doesContractImplementInterface(type(IVault).interfaceId))
            revert StrategyNotIVault();

        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        _setupRole(MANAGER_ROLE, _vault);

        vault = _vault;
        underlying = IERC20(_underlying);
        stabilityPool = IStabilityPool(_stabilityPool);
        lqty = IERC20(_lqty);
        usdc = IERC20(_usdc);

        // no need extra checks for these, since if these are wrong then the investedAssets method would revert automatically
        curveRouter = ICurveRouter(_curveRouter);
        curveLusdPool = _curveLusdPool;

        underlying.approve(_stabilityPool, type(uint256).max);
    }

    //
    // Modifiers
    //

    modifier onlyManager() {
        if (!hasRole(MANAGER_ROLE, msg.sender))
            revert StrategyCallerNotManager();
        _;
    }

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender))
            revert StrategyCallerNotOwner();
        _;
    }

    //
    // IStrategy
    //

    /**
     * Transfers administrator rights for the Strategy to another account,
     * revoking current admin roles and setting up the roles for the new admin.
     *
     * @notice Can only be called by the account with the ADMIN role.
     *
     * @param _newAdmin The new Strategy admin account.
     */
    function transferAdminRights(address _newAdmin) public onlyAdmin {
        if (_newAdmin == address(0x0)) revert StrategyOwnerCannotBe0Address();
        if (_newAdmin == msg.sender)
            revert StrategyCannotTransferOwnershipToSelf();

        _setupRole(DEFAULT_ADMIN_ROLE, _newAdmin);

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
            underlying.balanceOf(address(this)) +
            // usdc held by this contract in lusd denomination
            curveRouter.get_exchange_amount(
                curveLusdPool,
                address(usdc),
                address(underlying),
                usdc.balanceOf(address(this))
            );
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        uint256 balance = underlying.balanceOf(address(this));
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

        uint256 uninvestedUnderlying = underlying.balanceOf(address(this));

        if (amount > uninvestedUnderlying) {
            uint256 toWithdraw = amount - uninvestedUnderlying;

            // withdraw lusd from the stabilityPool to this contract
            // this will also withdraw the unclaimed lqty & eth rewards
            // if toWitdraw > the total deposits in stabilityPool, then the stabilityPool withdraws all the deposits
            stabilityPool.withdrawFromSP(toWithdraw);
        }

        uninvestedUnderlying = underlying.balanceOf(address(this));

        if (amount > uninvestedUnderlying) {
            // if even after withdrawing from the stability pool, the lusd balance is still not enough
            // then for the rest swap usdc held by the contract to lusd
            uint256 toSwap = amount - uninvestedUnderlying;

            // using curve for the usdc->lusd since that has the highest amount of lusd liquidity
            curveRouter.exchange(
                curveLusdPool,
                address(usdc),
                address(lusd),
                toSwap,
                1,
                address(this)
            );
        }

        // transfer underlying to vault
        underlying.safeTransfer(vault, amount);

        emit StrategyWithdrawn(amount);
    }

    /**
        swaps the ETH & LQTY rewards from the stability pool into usdc
     */
    function harvest(
        address _swapTarget,
        bytes calldata _lqtySwapData,
        bytes calldata _ethSwapData
    ) external payable onlyAdmin {
        // withdraw rewards from Liquity Stability Pool Contract
        stabilityPool.withdrawFromSP(0);

        // calculate rewards
        uint256 lqtyRewards = lqty.balanceOf(address(this));
        uint256 ethRewards = address(this).balance;

        // give out approvals to the swapTarget
        lqty.safeApprove(_swapTarget, lqtyRewards);

        bool success;
        if (lqtyRewards > 0) {
            // swap LQTY to USDC
            (success, ) = _swapTarget.call{value: msg.value}(_lqtySwapData);
            if (!success) revert SwapCallFailed(address(lqty));
        }

        // swap ETH to usdc
        if (ethRewards > 0) {
            (success, ) = _swapTarget.call{value: msg.value}(_ethSwapData);
            if (!success) revert SwapCallFailed(address(0));
        }
    }

    /**
        @notice swaps all the given fromtoken balance inside the contract to the toToken (coming from the 0xapi data)
        supposed to be used by the backend to swap the usdc held by the contract to lusd
        but can be used for other swaps too
     */
    function swap(
        IERC20 _fromToken,
        uint256 _amount,
        address _swapTarget,
        bytes calldata _swapData
    ) external payable onlyAdmin {
        _fromToken.approve(_swapTarget, _amount);
        (bool success, ) = _swapTarget.call{value: msg.value}(_swapData);
        if (!success) revert SwapCallFailed(address(_fromToken));
    }

    /**
        @notice set the curve router address and the curve lusd pool address
     */
    function setCurveRouterAndPool(address _curveRouter, address _curveLusdPool)
        external
        onlyAdmin
    {
        curveRouter = ICurveRouter(_curveRouter);
        curveLusdPool = _curveLusdPool;
    }
}

// the only problem is when withdrawals take place then in the case of a full withdrawal where somebody wants to withdraw all funds
// we may have problems if all our funds are not in lusd. If there are still funds in eth, lqty or usdc.
// then we need to add clauses in the withdraw which will convert eth/lqty/usdc to lusd in such scenarios and then withdraw the lusd.

// we can allow withdrawals anytime if the user is ready to take a loss
// the vault deposits to the strategy anyway, so we can just deposit to the strategy when we want
// call the harvest method from the vault before the invest method
