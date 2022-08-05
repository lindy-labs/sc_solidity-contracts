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

        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
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
        // if toWitdraw > the total deposits in stabilityPool, then the stabilityPool withdraws all the deposits
        stabilityPool.withdrawFromSP(amount);

        // transfer underlying to vault
        underlying.safeTransfer(vault, amount);

        emit StrategyWithdrawn(amount);
    }

    /**
        swaps the ETH & LQTY rewards from the stability pool into LUSD
     */
    function harvest(
        address _swapTarget,
        bytes calldata _lqtySwapData,
        bytes calldata _ethSwapData
    ) external onlyAdmin {
        // claim rewards from Liquity Stability Pool Contract
        stabilityPool.withdrawFromSP(0);

        reinvestRewards(_swapTarget, _lqtySwapData, _ethSwapData);
    }

    function reinvestRewards(
        address _swapTarget,
        bytes calldata _lqtySwapData,
        bytes calldata _ethSwapData
    ) public onlyAdmin {
        uint256 lqtyRewards = lqty.balanceOf(address(this));
        uint256 ethRewards = address(this).balance;

        bool success;
        if (lqtyRewards > 0) {
            // give approval to the swapTarget
            lqty.safeApprove(_swapTarget, lqtyRewards);

            // swap LQTY reward to LUSD
            (success, ) = _swapTarget.call{value: 0}(_lqtySwapData);
            if (!success) revert SwapCallFailed(address(lqty));
        }

        // swap ETH reward to LUSD
        if (ethRewards > 0) {
            (success, ) = _swapTarget.call{value: ethRewards}(_ethSwapData);
            if (!success) revert SwapCallFailed(address(0));
        }

        // invest gains into the stability pool
        uint256 balance = underlying.balanceOf(address(this));
        if (balance > 0) {
            stabilityPool.provideToSP(balance, address(0));
        }
    }

    /**
     * Strategy has to be able to receive ETH rewards from the liquity stability pool.
     */
    receive() external payable {}
}
