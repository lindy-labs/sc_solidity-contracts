// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Vault } from '/Users/alexandremota/Desktop/LindyLabs/sc_solidity-contracts/contracts/autoFinder_Vault.sol';
import { MockERC20 } from '/Users/alexandremota/Desktop/LindyLabs/sc_solidity-contracts/contracts/mock/autoFinder_MockERC20.sol';

contract VaultForCertora {

    Vault vault;
    MockERC20 underlying;
    uint256[] depositIds = [0]; // Certora does not support array return

    function mint_helper(address recip, uint256 amount) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01100000, 1037618708752) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01100001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01101000, recip) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01101001, amount) }
        underlying.mint(recip, amount);
        underlying.approve(address(vault), amount);
    }

    function depositParts(address inputToken, uint64 lockDuration, uint64 amount, string memory name, uint256 slippage) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01110000, 1037618708753) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01110001, 5) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01111000, inputToken) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01111001, lockDuration) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01111002, amount) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01111003, name) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01111004, slippage) }
        Vault.DepositParams memory _params;

        _params.inputToken = inputToken;
        _params.lockDuration = lockDuration;
        _params.amount = amount;
        _params.name = name;
        _params.slippage = slippage;

        depositIds = vault.deposit(_params);

    }

    function withdrawUp(address _to, uint64 amount) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01120000, 1037618708754) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01120001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01121000, _to) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01121001, amount) }
        vault.withdraw(_to, depositIds);
    }

}
