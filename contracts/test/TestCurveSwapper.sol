// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CurveSwapper} from "../vault/CurveSwapper.sol";
import {ICurve} from "../interfaces/curve/ICurve.sol";

contract TestCurveSwapper is CurveSwapper {
    address private _underlying;

    constructor(address __underlying, SwapPoolParam[] memory _swapPoolsParams) {
        _underlying = __underlying;
        _addPools(_swapPoolsParams);
    }

    function getUnderlying()
        public
        view
        override(CurveSwapper)
        returns (address)
    {
        return _underlying;
    }

    function test_swapIntoUnderlying(
        address _token,
        uint256 _amount,
        uint256 _minAmountOut
    ) external {
        _swapIntoUnderlying(_token, _amount, _minAmountOut);
    }

    function test_swapFromUnderlying(
        address _token,
        uint256 _amount,
        uint256 _minAmountOut
    ) external {
        _swapFromUnderlying(_token, _amount, _minAmountOut);
    }

    function test_addPool(SwapPoolParam memory _param) external {
        _addPool(_param);
    }

    function test_removePool(address _inputToken) external {
        _removePool(_inputToken);
    }
}
