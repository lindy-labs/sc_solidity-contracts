// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CurveSwapper} from "../vault/CurveSwapper.sol";
import {ICurve} from "../interfaces/curve/ICurve.sol";

contract TestCurveSwapper is CurveSwapper {
    constructor(
        address _underlying,
        address[] memory _tokens,
        ICurve[] memory _pools,
        int128[] memory _tokenIs,
        int128[] memory _underlyingIs
    ) CurveSwapper(_underlying, _tokens, _pools, _tokenIs, _underlyingIs) {}

    function test_swapIntoUnderlying(address _token, uint256 _amount) external {
        _swapIntoUnderlying(_token, _amount);
    }

    function test_swapFromUnderlying(address _token, uint256 _amount) external {
        _swapFromUnderlying(_token, _amount);
    }
}
