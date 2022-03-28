// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CurveSwapper} from "../vault/CurveSwapper.sol";
import {ICurve} from "../interfaces/curve/ICurve.sol";

contract TestCurveSwapper is CurveSwapper {
    address private _underlying;

    constructor(
        address __underlying,
        address[] memory _tokens,
        address[] memory _pools,
        int128[] memory _tokenIs,
        int128[] memory _underlyingIs
    ) {
        _underlying = __underlying;
        addPools(_tokens, _pools, _tokenIs, _underlyingIs);
    }

    function getUnderlying()
        public
        view
        override(CurveSwapper)
        returns (address)
    {
        return _underlying;
    }

    function test_swapIntoUnderlying(address _token, uint256 _amount) external {
        _swapIntoUnderlying(_token, _amount);
    }

    function test_swapFromUnderlying(address _token, uint256 _amount) external {
        _swapFromUnderlying(_token, _amount);
    }
}
