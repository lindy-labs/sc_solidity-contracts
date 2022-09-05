// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

/* 
 * Mock contract does not coincide with interface of production contract.
 * Used to emit event as found in production contract to simply simulate events that
 * rarely happen, for development.
 */
contract TroveManager {
    string public constant NAME = "TroveManager";

    event Liquidation(
        uint256 _liquidatedDebt,
        uint256 _liquidatedColl,
        uint256 _collGasCompensation,
        uint256 _LUSDGasCompensation
    );

    function liquidation(
        uint256 _liquidatedDebt,
        uint256 _liquidatedColl,
        uint256 _collGasCompensation,
        uint256 _LUSDGasCompensation
    ) public {
        emit Liquidation(
            _liquidatedDebt,
            _liquidatedColl,
            _collGasCompensation,
            _LUSDGasCompensation
        );
    }
}
