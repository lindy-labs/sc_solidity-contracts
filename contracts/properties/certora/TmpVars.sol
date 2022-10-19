// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.10;

contract TmpVars {
    uint256 private amountFromCertora;

    function getAmountFromCertora() public view returns (uint256) {
        return amountFromCertora;
    }

    function setAmountFromCertora(uint256 amount) public {
        amountFromCertora = amount;
    }

}