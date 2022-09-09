// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

library PercentMath {
    // Divisor used for representing percentages
    uint256 public constant PCT_DIVISOR = 10000;

    /**
     * @dev Returns whether an amount is a valid percentage out of PCT_DIVISOR
     * @param _amount Amount that is supposed to be a percentage
     */
    function validPct(uint256 _amount) internal pure returns (bool) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00cb0000, 1037618708683) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00cb0001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00cb1000, _amount) }
        return _amount <= PCT_DIVISOR;
    }

    /**
     * @dev Compute percentage of a value with the percentage represented by a fraction over PERC_DIVISOR
     * @param _amount Amount to take the percentage of
     * @param _fracNum Numerator of fraction representing the percentage with PCT_DIVISOR as the denominator
     */
    function pctOf(uint256 _amount, uint16 _fracNum)
        internal
        pure
        returns (uint256)
    {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00cc0000, 1037618708684) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00cc0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00cc1000, _amount) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00cc1001, _fracNum) }
        return (_amount * _fracNum) / PCT_DIVISOR;
    }

    /**
     * @dev Checks if a given number corresponds to 100%
     * @param _perc Percentage value to check, with PCT_DIVISOR
     */
    function is100Pct(uint256 _perc) internal pure returns (bool) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00cd0000, 1037618708685) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00cd0001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00cd1000, _perc) }
        return _perc == PCT_DIVISOR;
    }
}
