// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "./MockERC20.sol";

import "hardhat/console.sol";

contract Mock0x {
    uint8 public constant LQTY = 0;
    uint8 public constant LUSD = 1;
    uint8 public constant ETH = 2;

    MockLQTY public lqty;
    MockLUSD public lusd;

    constructor(MockLQTY _lqty, MockLUSD _lusd) {
        lqty = _lqty;
        lusd = _lusd;
    }

    fallback() external payable {
        (uint8 from, uint8 to, uint256 amount) = abi.decode(
            msg.data,
            (uint8, uint8, uint256)
        );
        console.log("from: %s, to: %s", from, to);
        console.log("amount: %s", amount);

        lusd.mint(msg.sender, amount);

        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 1)
            return(ptr, 0x20)
        }
    }

    receive() external payable {}
}
