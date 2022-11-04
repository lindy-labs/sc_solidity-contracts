// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Vault} from '../../contracts/Vault.sol';
import {ICurve} from "../../contracts/interfaces/curve/ICurve.sol";

contract VaultHarness is Vault {

    function getCurvePool(address _token) public view returns (ICurve) {
        return swappers[_token].pool;
    }

    constructor(
        IERC20Metadata _underlying,
        uint64 _minLockPeriod,
        uint16 _investPct,
        address _treasury,
        address _admin,
        uint16 _perfFeePct,
        uint16 _lossTolerancePct,
        SwapPoolParam[] memory _swapPools
    ) Vault(
        _underlying, 
        _minLockPeriod, 
        _investPct, 
        _treasury, 
        _admin, 
        _perfFeePct, 
        _lossTolerancePct, 
        _swapPools
    ) {}
}