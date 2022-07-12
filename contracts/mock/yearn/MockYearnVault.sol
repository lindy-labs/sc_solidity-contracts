// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";

contract MockYearnVault is IYearnVault, ERC20 {
    using SafeERC20 for ERC20;

    ERC20 immutable underlying;

    uint256 public lossToRealize;
    uint256 public maxLossWithdrawParam;

    constructor(
        string memory _name,
        string memory _symbol,
        address _underlying
    ) ERC20(_name, _symbol) {
        underlying = ERC20(_underlying);
    }

    function deposit(uint256 amount, address recipient)
        public
        returns (uint256)
    {
        require(amount > 0);
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        return _issueSharesForAmount(recipient, amount);
    }

    function pricePerShare() public view returns (uint256) {
        uint256 totalSupply = totalSupply();
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
        maxLossWithdrawParam = _maxLoss;

        uint256 value = (maxShares * pricePerShare()) /
            10**underlying.decimals();

        // simulate loss
        if (lossToRealize != 0) {
            if (lossToRealize * maxLossWithdrawParam * 10000 > value)
                revert("lossToRealize too high");

            value = value - lossToRealize;
        }

        _burn(msg.sender, maxShares);

        underlying.transfer(recipient, value);

        return value;
    }

    function totalAssets() external view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    function realizeLossOnWithdrawal(uint256 _lossAmount) public {
        lossToRealize = _lossAmount;
    }

    ///////////////// INTERNAL FUNCTIONS //////////////////////////////

    function _issueSharesForAmount(address to, uint256 amount)
        internal
        returns (uint256)
    {
        uint256 shares;
        uint256 totalSupply = totalSupply();
        if (totalSupply > 0) {
            shares = (amount * totalSupply) / _getUnderlyingBalance(); // dev: no free funds
        } else {
            shares = amount;
        }

        // Mint new shares
        _mint(to, shares);

        return shares;
    }

    function _getUnderlyingBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }
}
