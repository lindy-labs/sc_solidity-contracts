// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IRyskLiquidityPool} from "../../interfaces/rysk/IRyskLiquidityPool.sol";

// This contract aims to mimic the Rysk LiquidityPool contract as much as possible. For instance,
// the LiquidityPool has the 'epoch' (or 'depositReceipts', etc.) public field and to match that
// we have the same field implemented here.
//
// Because we want to interact with the LiquidityPool contract's fields in our strategy through an interface,
// and we cannot declare a field on an interface, we do not implement the IRyskLiquidityPool interface here.
// Instead, our strategy tests ensure that the API defined by IRyskLiquidityPool and the actual API of the LiquidityPool
// (MockRyskLiquidityPool) are indeed a match, implying that public fields from the LiquidityPool are accessible
// through methods with the same name described by the IRyskLiquidityPool interface.
contract MockRyskLiquidityPool is ERC20 {
    IERC20 immutable underlying;
    uint256 public depositEpoch;
    uint256 public withdrawalEpoch;
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
        withdrawalEpochPricePerShare[depositEpoch] = 1e18;
        withdrawalEpoch++;
        withdrawalEpochPricePerShare[withdrawalEpoch] = 1e18;
    }

    function deposit(uint256 _amount) external returns (bool) {
        require(_amount > 0);

        underlying.transferFrom(msg.sender, address(this), _amount);

        uint256 toMint = _getSharesForAmount(_amount);
        _mint(address(this), toMint);

        IRyskLiquidityPool.DepositReceipt storage receipt = depositReceipts[
            msg.sender
        ];

        receipt.epoch = uint128(depositEpoch);
        receipt.amount += uint128(_amount);
        receipt.unredeemedShares += toMint;

        return true;
    }

    // note two different behaviors depending on epoch:
    // 1. when called second time and epoch has not advanced => add to the previous receipt
    // 2. when called second time and epoch has advanced => revert
    function initiateWithdraw(uint256 _shares) external {
        require(_shares > 0);

        _redeemUnredeemedShares();

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

    function completeWithdraw(uint256 _shares) external returns (uint256) {
        require(_shares > 0);

        uint256 sharesToWithdraw = withdrawalReceipts[msg.sender].shares;

        uint256 amount = (sharesToWithdraw *
            withdrawalEpochPricePerShare[withdrawalEpoch]) / 1e18;

        underlying.transfer(msg.sender, amount);
        _burn(address(this), sharesToWithdraw);

        return amount;
    }

    function advanceWithdrawalEpoch() public {
        withdrawalEpoch++;
        uint256 pricePerShare = (totalAssets() * 1e18) / totalSupply();
        withdrawalEpochPricePerShare[withdrawalEpoch] = pricePerShare;
    }

    function totalAssets() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    function _getSharesForAmount(uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return (_amount * 1e18) / withdrawalEpochPricePerShare[withdrawalEpoch];
    }

    function _redeemUnredeemedShares() internal {
        uint256 unredeemedShares = depositReceipts[msg.sender].unredeemedShares;

        if (unredeemedShares != 0) {
            _transfer(address(this), msg.sender, unredeemedShares);
            depositReceipts[msg.sender].unredeemedShares = 0;
        }
    }
}
