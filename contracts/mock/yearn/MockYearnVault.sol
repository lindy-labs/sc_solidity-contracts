// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MockERC20} from "./../MockERC20.sol";

import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";

contract MockYearnVault is IYearnVault {
    using SafeERC20 for ERC20;

    ERC20 immutable underlying;
    MockERC20 immutable vaultShares;

    uint256 public spyForMaxLossWithdrawParam;

    constructor(
        string memory _name,
        string memory _symbol,
        address _underlying
    ) {
        underlying = ERC20(_underlying);
        vaultShares = new MockERC20(_name, _symbol, underlying.decimals(), 0);
    }

    function deposit(uint256 amount, address recipient)
        public
        returns (uint256)
    {
        require(amount > 0);

        uint256 newAmount = amount;

        if (amount == type(uint256).max)
            newAmount = underlying.balanceOf(msg.sender);

        underlying.safeTransferFrom(msg.sender, address(this), newAmount);

        return _issueSharesForAmount(recipient, newAmount);
    }

    function pricePerShare() public view returns (uint256) {
        uint256 totalSupply = vaultShares.totalSupply();
        if (totalSupply == 0) return 10**underlying.decimals();
        return
            (10**underlying.decimals() * _getUnderlyingBalance()) / totalSupply;
    }

    function withdraw(
        uint256 maxShares,
        address recipient,
        uint256 _maxLoss
    ) public returns (uint256) {
        require(maxShares > 0);

        // spy on _maxLoss param
        spyForMaxLossWithdrawParam = _maxLoss;

        uint256 value = (maxShares * pricePerShare()) /
            10**underlying.decimals();

        vaultShares.burn(msg.sender, maxShares);

        underlying.transfer(recipient, value);

        return value;
    }

    function totalAssets() external view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    ///////////////// INTERNAL FUNCTIONS //////////////////////////////

    function _issueSharesForAmount(address to, uint256 amount)
        internal
        returns (uint256)
    {
        uint256 shares;
        uint256 totalSupply = vaultShares.totalSupply();
        if (totalSupply > 0) {
            shares = (amount * totalSupply) / _getUnderlyingBalance(); // dev: no free funds
        } else {
            shares = amount;
        }

        // Mint new shares
        vaultShares.mint(to, shares);

        return shares;
    }

    function _getUnderlyingBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    function balanceOf(address account)
        external
        view
        override
        returns (uint256)
    {
        return vaultShares.balanceOf(account);
    }

    function decimals() external view returns (uint256) {
        return vaultShares.decimals();
    }
}
