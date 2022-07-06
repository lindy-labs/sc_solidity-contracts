// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

contract MockRyskLiquidityPool is ERC20 {
    using SafeERC20 for IERC20;
    
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
        approve(address(this), type(uint256).max);
        epoch++;
        epochPricePerShare[epoch] = 1e18;
    }

    function deposit(uint256 _amount) external returns (bool) {
        require(_amount > 0);

        underlying.safeTransferFrom(msg.sender, address(this), _amount);

        uint256 toMint = _getSharesForAmount(_amount);

        _mint(address(this), toMint);

        DepositReceipt storage receipt = depositReceipts[msg.sender];
        receipt.epoch = uint128(epoch);
        receipt.amount += uint128(_amount);
        receipt.unredeemedShares += toMint;

        return true;
    }

    function _getSharesForAmount(uint256 _amount) internal view returns (uint256) {
        return _amount / epochPricePerShare[epoch] * 1e18;
    }

    function initiateWithdraw(uint256 _shares) external {
        require(_shares > 0);

        // redeem shares if needed
        uint256 unredeemedShares = depositReceipts[msg.sender].unredeemedShares;

        if (unredeemedShares != 0) {
            this.approve(msg.sender, unredeemedShares);
            transferFrom(address(this), msg.sender, unredeemedShares);
            depositReceipts[msg.sender].unredeemedShares = 0;
        }

        uint256 sharesToWithdraw = _shares > this.balanceOf(msg.sender)
            ? this.balanceOf(msg.sender)
            : _shares;

        withdrawalReceipts[msg.sender] = WithdrawalReceipt({
            epoch: uint128(epoch),
            shares: uint128(sharesToWithdraw)
        });
    }

    function completeWithdraw(uint256 _shares) external returns (uint256) {
        require(_shares > 0);

        uint256 sharesToWithdraw = withdrawalReceipts[msg.sender].shares;

        uint256 amount = sharesToWithdraw * epochPricePerShare[epoch] / 1e18;

        underlying.approve(msg.sender, amount);
        underlying.transfer(msg.sender, amount);
        // todo fix
        _burn(msg.sender, sharesToWithdraw);

        return amount;
    }

    function advanceEpoch() external {
        epoch++;
        uint256 pricePerShare = totalAssets() / totalSupply() * 1e18;
        epochPricePerShare[epoch] = pricePerShare;
    }

    function totalAssets() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }
}
