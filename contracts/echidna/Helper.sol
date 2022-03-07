// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Addresses.sol";

contract Helper is Addresses {
    function mint_helper(address recip, uint256 amount) internal {
        underlying.mint(recip, amount);
        underlying.approve(address(vault), amount);
    }

    function one_to_max_uint64(uint256 random) internal returns (uint256) {
        return 1 + (random % (type(uint64).max - 1));
    }
}
