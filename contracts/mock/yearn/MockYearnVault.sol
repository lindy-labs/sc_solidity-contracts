// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";

contract MockYearnVault is IYearnVault, ERC20 {
    using SafeERC20 for IERC20;

    IERC20 immutable underlying;

    constructor(
        string memory _name,
        string memory _symbol,
        address _underlying
    ) ERC20(_name, _symbol) {
        underlying = IERC20(_underlying);
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
        if (totalSupply == 0) return 1e18;
        return (1e18 * _freeFunds()) / totalSupply;
    }

    function withdraw(
        uint256 maxShares,
        address recipient,
        uint256 /* maxLoss */
    ) public returns (uint256) {
        require(maxShares > 0);

        uint256 value = (maxShares * pricePerShare()) / 1e18;

        _burn(msg.sender, maxShares);

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
        uint256 totalSupply = totalSupply();
        if (totalSupply > 0) {
            shares = (amount * totalSupply) / _freeFunds(); // dev: no free funds
        } else {
            shares = amount;
        }

        // Mint new shares
        _mint(to, shares);

        return shares;
    }

    function _freeFunds() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }
}
