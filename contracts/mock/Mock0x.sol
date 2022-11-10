// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "./MockExchange.sol";

contract Mock0x is MockExchange {
    // 0x uses a fallback function as an entry point for doing swaps,
    // from there, depending of the tokens included in the swap,
    // the call is delegated to the corresponding contract which performs the actual swap
    // and returns true if successful.
    fallback() external payable {
        (address from, address to, uint256 amount) = abi.decode(
            msg.data,
            (address, address, uint256)
        );

        swapTokens(from, to, amount);

        // we need to use assembly to return true for a sucessful swap
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 1)
            return(ptr, 0x20)
        }
    }

    receive() external payable {}
}
