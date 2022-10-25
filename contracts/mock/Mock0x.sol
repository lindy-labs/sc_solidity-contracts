// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "./MockExchange.sol";

contract Mock0x is MockExchange {
    fallback() external payable {
        (address from, address to, uint256 amount) = abi.decode(
            msg.data,
            (address, address, uint256)
        );

        swapTokens(from, to, amount);

        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 1)
            return(ptr, 0x20)
        }
    }

    receive() external payable {}
}
