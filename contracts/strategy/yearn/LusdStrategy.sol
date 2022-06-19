// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {PercentMath} from "../../lib/PercentMath.sol";
import {ERC165Query} from "../../lib/ERC165Query.sol";
import {IStrategy} from "../IStrategy.sol";
import {CustomErrors} from "../../interfaces/CustomErrors.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";
import {IVault} from "../../vault/IVault.sol";

contract LusdStrategy is IStrategy, AccessControl, CustomErrors {
    using SafeERC20 for IERC20;
    using PercentMath for uint256;
    using ERC165Query for address;

    error StrategyNoUnderlying();
    error StrategyNotEnoughShares();

    bytes32 public constant MANAGER_ROLE =
        0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08; // keccak256("MANAGER_ROLE");

    IERC20 public immutable underlying;
    /// @inheritdoc IStrategy
    address public immutable override(IStrategy) vault;
    // yearn vault that this strategy is interacting with
    IYearnVault public immutable yVault;

    constructor(
        address _vault,
        address _owner,
        address _yVault,
        address _underlying
    ) {
        if (_owner == address(0)) revert StrategyOwnerCannotBe0Address();
        if (!_vault.doesContractImplementInterface(type(IVault).interfaceId))
            revert StrategyNotIVault();

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(MANAGER_ROLE, _vault);
        vault = _vault;
        yVault = IYearnVault(_yVault);
        underlying = IERC20(_underlying);
    }

    //
    // Modifiers
    //

    modifier onlyManager() {
        if (!hasRole(MANAGER_ROLE, msg.sender))
            revert StrategyCallerNotManager();
        _;
    }

    /// @inheritdoc IStrategy
    function hasAssets()
        external
        view
        virtual
        override(IStrategy)
        returns (bool)
    {
        return _getSharesBalance() > 0;
    }

    /**
     * Amount, expressed in the underlying currency, currently in the strategy
     *
     * @return The total amount of underlying invested into yearn vault
     */
    function investedAssets()
        external
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        return _sharesToUnderlying(_getSharesBalance());
    }

    /**
     * @notice deposits all the currently held lusd by the contract into yearn's lusd vault
     */
    function invest() external virtual override(IStrategy) onlyManager {
        uint256 balance = _getUnderlyingBalance();
        if (balance == 0) revert StrategyNoUnderlying();

        underlying.safeIncreaseAllowance(address(yVault), balance);

        yVault.deposit(balance, address(this));
    }

    /// @inheritdoc IStrategy
    function withdrawToVault(uint256 amount)
        external
        virtual
        override(IStrategy)
    {
        if (amount == 0) revert StrategyAmountZero();
        uint256 uninvestedUnderlying = _getUnderlyingBalance();

        if (amount > uninvestedUnderlying) {
            uint256 _sharesToWithdraw = _underlyingToShares(
                amount - uninvestedUnderlying
            );

            if (_sharesToWithdraw > _getSharesBalance())
                revert StrategyNotEnoughShares();

            // burn shares and withdraw required underlying to strategy
            yVault.withdraw(_sharesToWithdraw, address(this), 1);
        }

        // transfer underlying to vault
        underlying.safeTransferFrom(address(this), vault, amount);
    }

    /// @inheritdoc IStrategy
    function withdrawAllToVault()
        external
        virtual
        override(IStrategy)
        onlyManager
    {
        uint256 sharesBalance = _getSharesBalance();
        if (sharesBalance == 0) revert StrategyNotEnoughShares();
        // burn shares and withdraw required underlying to strategy
        yVault.withdraw(sharesBalance, vault, 1);
    }

    /**
     * @return LUSD balance of strategy
     */
    function _getUnderlyingBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    /**
     * @return yLusd balance of strategy
     */
    function _getSharesBalance() internal view returns (uint256) {
        return yVault.balanceOf(address(this));
    }

    /**
     * @return convert shares to lusd
     */
    function _sharesToUnderlying(uint256 _shares)
        internal
        view
        returns (uint256)
    {
        return (_shares * yVault.pricePerShare()) / 1e18;
    }

    /**
     * @return convert shares to lusd
     */
    function _underlyingToShares(uint256 _underlying)
        internal
        view
        returns (uint256)
    {
        return (_underlying * 1e18) / yVault.pricePerShare();
    }
}
