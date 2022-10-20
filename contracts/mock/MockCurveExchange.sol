// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/curve/ICurveExchange.sol";

import "hardhat/console.sol";

contract MockCurveExchange is ICurveExchange {
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address public LUSD;

    constructor(address _lusd) {
        LUSD = _lusd;
    }

    function get_exchange_amount(
        address _pool,
        address _from,
        address _to,
        uint256 _amount
    ) external view returns (uint256) {
        // console.log(_from);
        // console.log(_to);
        // console.log(_amount);

        return _amount;
    }
}
