// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

contract MockCurveRouter {
    /**
        @notice we are using this as mock for the curve Router for getting usdc to lusd rate
        so here we are just returning the same amount, i.e usdc:lusd in the ratio 1:1
     */
    function get_exchange_amount(
        address _pool,
        address _fromToken,
        address _toToken,
        uint256 _amount
    ) public view returns (uint256) {
        return _amount;
    }
}
