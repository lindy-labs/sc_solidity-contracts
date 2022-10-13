// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

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
    ERC20 immutable underlying;
    uint256 public depositEpoch;
    uint256 public pendingDeposits;
    uint256 public withdrawalEpoch;
    uint256 public underlyingDecimals;

    mapping(uint256 => uint256) public depositEpochPricePerShare;
    mapping(uint256 => uint256) public withdrawalEpochPricePerShare;
    mapping(address => IRyskLiquidityPool.DepositReceipt)
        public depositReceipts;
    mapping(address => IRyskLiquidityPool.WithdrawalReceipt)
        public withdrawalReceipts;

    constructor(
        string memory _name,
        string memory _symbol,
        ERC20 _underlying
    ) ERC20(_name, _symbol) {
        underlying = _underlying;
        underlyingDecimals = _underlying.decimals();

        depositEpochPricePerShare[depositEpoch] = 1e18;
        depositEpoch++;
        withdrawalEpochPricePerShare[withdrawalEpoch] = 1e18;
        withdrawalEpoch++;
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
            depositReceipt.epoch = uint128(depositEpoch);
        }

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

        if (withdrawalReceipt.epoch == withdrawalEpoch) {
            // add to the previous receipt since withdrawal is already initiated for this epoch
            withdrawalReceipt.shares = uint128(
                withdrawalReceipt.shares + _shares
            );

            return;
        }

        if (withdrawalReceipt.shares > 0) {
            require(false, "Withdrawal already initiated");
        }

        withdrawalReceipt.epoch = uint128(withdrawalEpoch);
        withdrawalReceipt.shares = uint128(_shares);
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

    function completeWithdraw() external returns (uint256) {
        IRyskLiquidityPool.WithdrawalReceipt
            storage withdrawalReceipt = withdrawalReceipts[msg.sender];

        _burn(address(this), withdrawalReceipt.shares);

        uint256 amount = _getAmountForShares(
            withdrawalReceipt.shares,
            withdrawalEpochPricePerShare[withdrawalReceipt.epoch]
        );
        underlying.transfer(msg.sender, amount);

        withdrawalReceipt.shares = 0;

        return amount;
    }

    function executeEpochCalculation() public {
        uint256 newPricePerShare;
        if (totalSupply() == 0) {
            newPricePerShare = 1e18;
        } else {
            newPricePerShare =
                ((((totalAssets() - pendingDeposits) * 1e18) / totalSupply()) *
                    1e18) /
                10**underlyingDecimals;
        }

        depositEpochPricePerShare[depositEpoch] = newPricePerShare;
        withdrawalEpochPricePerShare[withdrawalEpoch] = newPricePerShare;

        if (pendingDeposits != 0) {
            uint256 sharesToMint = _getSharesForAmount(
                pendingDeposits,
                newPricePerShare
            );

            _mint(address(this), sharesToMint);
            delete pendingDeposits;
        }

        depositEpoch++;
        withdrawalEpoch++;
    }

    function totalAssets() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    function _getSharesForAmount(uint256 _amount, uint256 _pricePerShare)
        internal
        view
        returns (uint256)
    {
        return
            (((_amount * 1e18) / _pricePerShare) * 1e18) /
            10**underlyingDecimals;
    }

    function _getAmountForShares(uint256 _shares, uint256 _pricePerShare)
        internal
        view
        returns (uint256)
    {
        return
            (((_shares * _pricePerShare) / 1e18) * 10**underlyingDecimals) /
            1e18;
    }
}
