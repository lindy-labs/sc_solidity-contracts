// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "../lib/PercentMath.sol";

contract EchidnaPercentMath {
    function percOf(
		    uint256 _amount,
		    uint256 _fracNum,
		    uint256 _fracDenom
		    ) external pure {
        uint256 perc = PercentMath.percOf(_amount, _fracNum, _fracDenom);
        assert (perc <=  _amount);
    }
}
