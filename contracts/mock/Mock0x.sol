// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "./MockERC20.sol";

import "hardhat/console.sol";

contract Mock0x {
    mapping(address => bool) supportedTokens;
    mapping(uint160 => uint256) exchageRates;

    constructor(address[] memory _tokens) {
        addTokens(_tokens);
    }

    function addTokens(address[] memory _tokens) public {
        for (uint8 i = 0; i < _tokens.length; i++) {
            supportedTokens[_tokens[i]] = true;
        }
    }

    function setExchageRate(
        address from,
        address to,
        uint256 rate // e18
    ) external {
        exchageRates[uint160(from) ^ uint160(to)] = rate;
    }

    function getExchangeRate(address from, address to)
        public
        view
        returns (uint256)
    {
        return
            exchageRates[uint160(from) ^ uint160(to)] > 0
                ? exchageRates[uint160(from) ^ uint160(to)]
                : 1e18;
    }

    function swapTokens(
        address _from,
        address _to,
        uint256 _amount
    ) public payable {
        if (_from == address(0) && msg.value != _amount) {
            revert("Mock0x: ETH amount mismatch");
        }

        if (_to == address(0)) {
            payable(msg.sender).transfer(
                (_amount * getExchangeRate(_from, _to)) / 1e18
            );
        } else if (supportedTokens[_to]) {
            uint256 toMint = (_amount * getExchangeRate(_from, _to)) / 1e18;
            MockERC20(_to).mint(msg.sender, toMint);
        }

        if (supportedTokens[_from]) {
            MockERC20(_from).burn(msg.sender, _amount);
        }
    }

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
