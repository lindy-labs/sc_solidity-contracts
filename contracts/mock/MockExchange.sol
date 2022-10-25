// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "./MockERC20.sol";

import "hardhat/console.sol";

abstract contract MockExchange {
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
        address _from,
        address _to,
        uint256 _rate // e18
    ) external {
        exchageRates[_getExchangeRateKey(_from, _to)] = _rate;
    }

    function getExchangeRate(address _from, address _to)
        public
        view
        returns (uint256)
    {
        uint256 exchageRate = exchageRates[_getExchangeRateKey(_from, _to)];
        return exchageRate > 0 ? exchageRate : 1e18;
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

    function _getExchangeRateKey(address _from, address _to)
        internal
        pure
        returns (uint160)
    {
        return (uint160(_from) << 1) ^ uint160(_to);
    }
}
