// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.10;

contract TmpVars {
    uint256 private amountFromCertora;

    function getAmountFromCertora() public view returns (uint256) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00a90000, 1037618708649) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00a90001, 0) }
        return amountFromCertora;
    }

    function setAmountFromCertora(uint256 amount) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00aa0000, 1037618708650) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00aa0001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00aa1000, amount) }
        amountFromCertora = amount;
    }

}