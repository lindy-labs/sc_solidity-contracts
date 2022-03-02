// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Addresses.sol";

contract Helper is Addresses {
    function mint_helper(address recip, uint256 amount) internal {
        underlying.mint(recip, amount);
	underlying.approve(address(vault), amount);
    }
}
