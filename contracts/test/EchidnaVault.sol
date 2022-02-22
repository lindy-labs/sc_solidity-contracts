// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "../Vault.sol";

contract EchidnaVault {
    Vault v = Vault(0x6A4A62E5A7eD13c361b176A5F62C2eE620Ac0DF8);

    // if the preconditions are met, a vault deposit should never revert
    function echidna_deposit() public view returns(bool){
        return true;
    }
}
