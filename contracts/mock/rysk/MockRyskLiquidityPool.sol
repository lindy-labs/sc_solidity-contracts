// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";

contract MockRyskLiquidityPool is ERC20 {
    IERC20 immutable underlying;
    uint256 public epoch;
    mapping(uint256 => uint256) public epochPricePerShare;
    mapping(address => DepositReceipt) public depositReceipts;
    mapping(address => WithdrawalReceipt) public withdrawalReceipts;

    struct DepositReceipt {
        uint128 epoch;
        uint128 amount;
        uint256 unredeemedShares;
    }

    struct WithdrawalReceipt {
        uint128 epoch;
        uint128 shares;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        address _underlying
    ) ERC20(_name, _symbol) {
        underlying = IERC20(_underlying);

        epoch++;
        epochPricePerShare[epoch] = 1e18;
    }

    function deposit(uint256 _amount) external returns (bool) {
        require(_amount > 0);

        underlying.transferFrom(msg.sender, address(this), _amount);

        uint256 toMint = _getSharesForAmount(_amount);
        _mint(address(this), toMint);

        DepositReceipt storage receipt = depositReceipts[msg.sender];
        receipt.epoch = uint128(epoch);
        receipt.amount += uint128(_amount);
        receipt.unredeemedShares += toMint;

        return true;
    }

    // to mimic behavior of Rysk liquidity pool we neeed to consider this cases:
    // 1. when called second time and epoch has not advanced => add to the previous receipt
    // 2. when called second time and epoch has advanced => override the previous receipt

    // how to test this?
    // pay attention to invested assets = undredeemed shares + redeemed shares
    // invested assets after initiate withdrawal? -> invested assets doesn't change

    // vault calls updateInvested multiple times in the same epoch?
    // actual -> all withdrawal requests will be aggregated
    // update invested after uncompleted withdrawal? -> override? but should it?
    // update invested can be called multiple times in the same or in new epoch,
    // we want to aggregate all withdrawal requests in the same epoch
    function initiateWithdraw(uint256 _shares) external {
        require(_shares > 0);

        _redeemUnredeemedShares();

        WithdrawalReceipt storage withdrawalReceipt = withdrawalReceipts[
            msg.sender
        ];

        uint256 sharesToWithdraw;
        if (withdrawalReceipt.epoch == epoch) {
            require(
                withdrawalReceipt.shares + _shares <=
                    this.balanceOf(msg.sender),
                "Not enough shares to withdraw"
            );
            sharesToWithdraw = withdrawalReceipt.shares + _shares;
        } else {
            require(
                _shares <= this.balanceOf(msg.sender),
                "Not enough shares to withdraw"
            );
            sharesToWithdraw = _shares;
        }

        withdrawalReceipt.epoch = uint128(epoch);
        withdrawalReceipt.shares = uint128(sharesToWithdraw);
    }

    function completeWithdraw(uint256 _shares) external returns (uint256) {
        require(_shares > 0);

        uint256 sharesToWithdraw = withdrawalReceipts[msg.sender].shares;

        uint256 amount = (sharesToWithdraw * epochPricePerShare[epoch]) / 1e18;

        underlying.transfer(msg.sender, amount);
        _burn(msg.sender, sharesToWithdraw);

        return amount;
    }

    function advanceEpoch() external {
        epoch++;
        uint256 pricePerShare = (totalAssets() * 1e18) / totalSupply();
        epochPricePerShare[epoch] = pricePerShare;
    }

    function totalAssets() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    function _getSharesForAmount(uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return (_amount * 1e18) / epochPricePerShare[epoch];
    }

    function _redeemUnredeemedShares() internal {
        uint256 unredeemedShares = depositReceipts[msg.sender].unredeemedShares;

        if (unredeemedShares != 0) {
            this.transfer(msg.sender, unredeemedShares);
            depositReceipts[msg.sender].unredeemedShares = 0;
        }
    }
}
