// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Vault } from '/Users/alexandremota/Desktop/LindyLabs/sc_solidity-contracts/contracts/autoFinder_Vault.sol';

contract VaultForCertora {

    Vault vault;

    function depositParts(address inputToken, uint64 lockDuration, uint64 amount, /*string memory name,*/ uint256 slippage) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d0000, 1037618708621) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d0001, 4) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1000, inputToken) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1001, lockDuration) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1002, amount) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1003, slippage) }
        Vault.DepositParams memory _params;

        _params.inputToken = inputToken;
        _params.lockDuration = lockDuration;
        _params.amount = amount;
        _params.name = "MockERC20";//name;
        _params.slippage = slippage;

        vault.deposit(_params);

    }

}
