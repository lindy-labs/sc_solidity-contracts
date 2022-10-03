// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IRyskLiquidityPool} from "../../interfaces/rysk/IRyskLiquidityPool.sol";

// This contract aims to mimic the Rysk LiquidityPool contract as much as possible. For instance,
// the LiquidityPool has the 'epoch' (or 'depositReceipts', etc.) public field and to match that
// we have the same field implemented here.
//
// The mechanics for deposits/withdrawals used in the Rysk LiquidityPool are replicated by this contract
// and it should behave in the same way as the LiquidityPool in that sense.
//
// Because we want to interact with the LiquidityPool contract's fields in our strategy through an interface,
// and we cannot declare a field on an interface, we do not implement the IRyskLiquidityPool interface here.
// Instead, our strategy tests ensure that the API defined by IRyskLiquidityPool and the actual API of the LiquidityPool
// (MockRyskLiquidityPool) are indeed a match, implying that public fields from the LiquidityPool are accessible
// through methods with the same name described by the IRyskLiquidityPool interface.
contract MockRyskLiquidityPool is ERC20 {
    IERC20 immutable underlying;
    uint256 public depositEpoch;
    uint256 public pendingDeposits;
    uint256 public withdrawalEpoch;

    mapping(uint256 => uint256) public depositEpochPricePerShare;
    mapping(uint256 => uint256) public withdrawalEpochPricePerShare;
    mapping(address => IRyskLiquidityPool.DepositReceipt)
        public depositReceipts;
    mapping(address => IRyskLiquidityPool.WithdrawalReceipt)
        public withdrawalReceipts;

    constructor(
        string memory _name,
        string memory _symbol,
        address _underlying
    ) ERC20(_name, _symbol) {
        underlying = IERC20(_underlying);

        depositEpoch++;
        depositEpochPricePerShare[depositEpoch] = 1e18;
        withdrawalEpoch++;
        withdrawalEpochPricePerShare[withdrawalEpoch] = 1e18;
    }

    function deposit(uint256 _amount) external returns (bool) {
        require(_amount > 0);

        IRyskLiquidityPool.DepositReceipt
            storage depositReceipt = depositReceipts[msg.sender];

        if (depositReceipt.epoch != 0 && depositReceipt.epoch < depositEpoch) {
            depositReceipt.unredeemedShares += _getSharesForAmount(
                depositReceipt.amount,
                depositEpochPricePerShare[depositReceipt.epoch]
            );
        }

        if (depositReceipt.epoch == depositEpoch) {
            depositReceipt.amount += uint128(_amount);
        } else {
            depositReceipt.amount = uint128(_amount);
        }

        depositReceipt.epoch = uint128(depositEpoch);

        pendingDeposits += _amount;
        underlying.transferFrom(msg.sender, address(this), _amount);

        return true;
    }

    // note two different behaviors depending on epoch:
    // 1. when called second time and epoch has not advanced => add to the previous receipt
    // 2. when called second time and epoch has advanced => revert
    function initiateWithdraw(uint256 _shares) external {
        require(_shares > 0);

        redeem(type(uint256).max);

        require(
            _shares <= balanceOf(msg.sender),
            "Not enough shares to withdraw"
        );

        IRyskLiquidityPool.WithdrawalReceipt
            storage withdrawalReceipt = withdrawalReceipts[msg.sender];

        // transfer shares to the pool to initiate withdrawal
        _transfer(msg.sender, address(this), _shares);

        if (withdrawalReceipt.epoch == 0) {
            // initiate withdrawal receipt
            withdrawalReceipt.epoch = uint128(withdrawalEpoch);
            withdrawalReceipt.shares = uint128(_shares);
            return;
        }

        if (withdrawalReceipt.epoch == withdrawalEpoch) {
            // add to the previous receipt since withdrawal is already initiated for this epoch
            withdrawalReceipt.shares = uint128(
                withdrawalReceipt.shares + _shares
            );
            return;
        }

        require(false, "Withdrawal already initiated");
    }

    function redeem(uint256 _sharesToRedeem) public returns (uint256) {
        require(_sharesToRedeem > 0, "Shares to redeem must be greater than 0");

        IRyskLiquidityPool.DepositReceipt
            storage depositReceipt = depositReceipts[msg.sender];

        if (
            depositReceipt.epoch == 0 ||
            (depositReceipt.amount == 0 && depositReceipt.unredeemedShares == 0)
        ) {
            return 0;
        }

        if (depositReceipt.epoch < depositEpoch && depositReceipt.amount != 0) {
            depositReceipt.unredeemedShares += _getSharesForAmount(
                depositReceipt.amount,
                depositEpochPricePerShare[depositReceipt.epoch]
            );

            depositReceipt.amount = 0;
        }

        if (depositReceipt.unredeemedShares == 0) {
            return 0;
        }

        _sharesToRedeem = _sharesToRedeem > depositReceipt.unredeemedShares
            ? depositReceipt.unredeemedShares
            : _sharesToRedeem;

        _transfer(address(this), msg.sender, _sharesToRedeem);

        depositReceipts[msg.sender].unredeemedShares -= _sharesToRedeem;

        return _sharesToRedeem;
    }

    function completeWithdraw(uint256 _shares) external returns (uint256) {
        require(_shares > 0);

        IRyskLiquidityPool.WithdrawalReceipt
            storage withdrawalReceipt = withdrawalReceipts[msg.sender];

        require(
            _shares <= withdrawalReceipt.shares,
            "Not enough shares to withdraw"
        );

        withdrawalReceipt.shares -= uint128(_shares);
        _burn(address(this), _shares);

        uint256 amount = (_shares *
            withdrawalEpochPricePerShare[withdrawalEpoch]) / 1e18;
        underlying.transfer(msg.sender, amount);

        return amount;
    }

    function executeEpochCalculation() public {
        calculateDepositEpoch();
        calculateWithdrawalEpoch();
    }

    function calculateDepositEpoch() public {
        if (pendingDeposits != 0) {
            uint256 sharesToMint = _getSharesForAmount(
                pendingDeposits,
                depositEpochPricePerShare[depositEpoch]
            );

            _mint(address(this), sharesToMint);
            delete pendingDeposits;
        }

        depositEpoch++;

        uint256 pricePerShare = (totalAssets() * 1e18) / totalSupply();
        depositEpochPricePerShare[depositEpoch] = pricePerShare;
    }

    function calculateWithdrawalEpoch() public {
        withdrawalEpoch++;

        uint256 pricePerShare = (totalAssets() * 1e18) / totalSupply();
        withdrawalEpochPricePerShare[withdrawalEpoch] = pricePerShare;
    }

    function totalAssets() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    function _getSharesForAmount(uint256 _amount, uint256 _pricePerShare)
        internal
        pure
        returns (uint256)
    {
        return (_amount * 1e18) / _pricePerShare;
    }
}
