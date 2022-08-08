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

/***
 * Liquity Strategy generates yield by investing LUSD assets into Liquity Stability Pool contract.
 * Stability pool gives out LQTY & ETH as rewards for liquidity providers.
 * TODO: check this with diganta
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

    error StrategyStabilityPoolCannotBeAddressZero();
    error StrategyYieldTokenCannotBe0Address();
    error StrategyNothingToReinvest();
    error StrategySwapTargetCannotBe0Address();
    error StrategyLQTYSwapDataEmpty();
    error StrategyETHSwapDataEmpty();
    error StrategyLQTYSwapFailed();
    error StrategyETHSwapFailed();

    // TODO: test emitted events
    event StrategyRewardsClaimed(uint256 amountInLQTY, uint256 amountInETH);
    event StrategyRewardsReinvested(uint256 amountInLUSD);

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    IERC20 public immutable underlying; // lusd
    /// @inheritdoc IStrategy
    address public immutable override(IStrategy) vault;
    IStabilityPool public immutable stabilityPool;
    IERC20 public immutable lqty; // reward token

    constructor(
        address _vault,
        address _admin,
        address _stabilityPool,
        address _lqty,
        address _underlying
    ) {
        if (_admin == address(0)) revert StrategyAdminCannotBe0Address();
        if (_lqty == address(0)) revert StrategyYieldTokenCannotBe0Address();
        if (_stabilityPool == address(0))
            revert StrategyStabilityPoolCannotBeAddressZero();
        if (_underlying == address(0))
            revert StrategyUnderlyingCannotBe0Address();

        if (!_vault.doesContractImplementInterface(type(IVault).interfaceId))
            revert StrategyNotIVault();

        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        _setupRole(MANAGER_ROLE, _admin);
        _setupRole(MANAGER_ROLE, _vault);

        vault = _vault;
        underlying = IERC20(_underlying);
        stabilityPool = IStabilityPool(_stabilityPool);
        lqty = IERC20(_lqty);

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
            revert StrategyCallerNotAdmin();
        _;
    }

    /**
     * Transfers administrator rights for the Strategy to another account,
     * revoking current admin roles and setting up the roles for the new admin.
     *
     * @notice Can only be called by the account with the ADMIN role.
     *
     * @param _newAdmin The new Strategy admin account.
     */
    function transferAdminRights(address _newAdmin) public onlyAdmin {
        if (_newAdmin == address(0x0)) revert StrategyAdminCannotBe0Address();
        if (_newAdmin == msg.sender)
            revert StrategyCannotTransferAdminRightsToSelf();

        _setupRole(DEFAULT_ADMIN_ROLE, _newAdmin);
        _setupRole(MANAGER_ROLE, _newAdmin);

        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _revokeRole(MANAGER_ROLE, msg.sender);
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
    /// @notice ETH & LQTY rewards of the strategy waiting to be claimed in the liquity stability pool are not included
    function investedAssets()
        public
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        return stabilityPool.getCompoundedLUSDDeposit(address(this));
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        uint256 balance = underlying.balanceOf(address(this));
        if (balance == 0) revert StrategyNoUnderlying();

        stabilityPool.provideToSP(balance, address(0));

        emit StrategyInvested(balance);
    }

    /// @inheritdoc IStrategy
    /// @notice will also claim unclaimed LQTY & ETH gains
    /// @notice when amount > total deposited, all available funds will be withdrawn
    function withdrawToVault(uint256 amount)
        external
        virtual
        override(IStrategy)
        onlyManager
    {
        if (amount == 0) revert StrategyAmountZero();
        if (amount > investedAssets()) revert StrategyNotEnoughShares();

        // withdraws underlying amount and claims LQTY & ETH rewards
        stabilityPool.withdrawFromSP(amount);

        uint256 lqtyRewards = lqty.balanceOf(address(this));
        uint256 ethRewards = address(this).balance;

        emit StrategyRewardsClaimed(lqtyRewards, ethRewards);

        // transfer underlying to vault
        uint256 balance = underlying.balanceOf(address(this));
        underlying.safeTransfer(vault, balance);

        emit StrategyWithdrawn(balance);
    }

    /**
     * Collects the LQTY & ETH rewards from the stability pool, swaps the rewards to LUSD,
     * and reinvests swapped LUSD amount into the stability pool to create compound interest on future gains.
     *
     * @notice Can only be called by the account with the ADMIN role.
     * @notice Implicitly calls the reinvestRewards function.
     * @notice Arguments provided to harvest function are real-time data obtained from '0x' api.
     *
     * @param _swapTarget the address of the '0x' contract performing the tokens swap.
     * @param _lqtySwapData data used to perform LQTY -> LUSD swap.
     * @param _ethSwapData data used to perform ETH -> LUSD swap.
     */
    function harvest(
        address _swapTarget,
        bytes calldata _lqtySwapData,
        bytes calldata _ethSwapData
    ) external onlyAdmin {
        // claim rewards
        stabilityPool.withdrawFromSP(0);

        reinvestRewards(_swapTarget, _lqtySwapData, _ethSwapData);
    }

    /**
     * Swaps LQTY tokens and ETH already held by the strategy to LUSD,
     * and reinvests swapped LUSD amount into the stability pool.
     *
     * @notice Can only be called by the account with the ADMIN role.
     * @notice Arguments provided are real-time data obtained from '0x' api.
     *
     * @param _swapTarget the address of the '0x' contract performing the tokens swap.
     * @param _lqtySwapData data used to perform LQTY -> LUSD swap.
     * @param _ethSwapData data used to perform ETH -> LUSD swap.
     */
    function reinvestRewards(
        address _swapTarget,
        bytes calldata _lqtySwapData,
        bytes calldata _ethSwapData
    ) public onlyAdmin {
        uint256 lqtyBalance = lqty.balanceOf(address(this));
        uint256 ethBalance = address(this).balance;

        if (lqtyBalance == 0 && ethBalance == 0)
            revert StrategyNothingToReinvest();

        checkSwapData(_swapTarget, _lqtySwapData, _ethSwapData);

        if (lqtyBalance > 0) {
            lqty.safeApprove(_swapTarget, lqtyBalance);

            // swap LQTY reward to LUSD
            // TODO - response?
            (bool success, ) = _swapTarget.call{value: 0}(_lqtySwapData);
            if (!success) revert StrategyLQTYSwapFailed();
        }

        // swap ETH reward to LUSD
        if (ethBalance > 0) {
            (bool success, ) = _swapTarget.call{value: ethBalance}(
                _ethSwapData
            );
            if (!success) revert StrategyETHSwapFailed();
        }

        // reinvest gains into the stability pool
        uint256 balance = underlying.balanceOf(address(this));
        if (balance > 0) {
            emit StrategyRewardsReinvested(balance);

            stabilityPool.provideToSP(balance, address(0));
        }
    }

    /**
     * Checks that the data for swapping LQTY and ETH to LUSD is valid.
     *
     * @notice Arguments provided are real-time data obtained from '0x' api.
     *
     * @param _swapTarget the address of the '0x' contract performing the tokens swap.
     * @param _lqtySwapData data used to perform LQTY -> LUSD swap.
     * @param _ethSwapData data used to perform ETH -> LUSD swap.
     */
    function checkSwapData(
        address _swapTarget,
        bytes calldata _lqtySwapData,
        bytes calldata _ethSwapData
    ) public {
        // TODO tests
        if (_swapTarget == address(0))
            revert StrategySwapTargetCannotBe0Address();

        uint256 lqtyBalance = lqty.balanceOf(address(this));

        if (lqtyBalance > 0 && _lqtySwapData.length == 0)
            revert StrategyLQTYSwapDataEmpty();

        uint256 ethBalance = address(this).balance;

        if (ethBalance > 0 && _ethSwapData.length == 0)
            revert StrategyETHSwapDataEmpty();
    }

    /**
     * Strategy has to be able to receive ETH as stability pool rewards.
     */
    receive() external payable {}
}
