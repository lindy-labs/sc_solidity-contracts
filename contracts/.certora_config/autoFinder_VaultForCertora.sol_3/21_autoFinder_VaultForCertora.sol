// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Vault } from '/Users/alexandremota/Desktop/LindyLabs/sc_solidity-contracts/contracts/autoFinder_Vault.sol';
import { MockERC20 } from '/Users/alexandremota/Desktop/LindyLabs/sc_solidity-contracts/contracts/mock/autoFinder_MockERC20.sol';

contract VaultForCertora {

    Vault vault;
    MockERC20 underlying;
    uint256[] depositIds = [0]; // Certora does not support array return

    function mint_helper(address recip, uint256 amount) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008c0000, 1037618708620) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008c0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008c1000, recip) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008c1001, amount) }
        underlying.mint(recip, amount);
        underlying.approve(address(vault), amount);
    }

    function depositParts(address inputToken, uint64 lockDuration, uint64 amount, string memory name, uint256 slippage) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d0000, 1037618708621) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d0001, 5) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1000, inputToken) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1001, lockDuration) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1002, amount) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1003, name) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1004, slippage) }
        Vault.DepositParams memory _params;

        _params.inputToken = inputToken;
        _params.lockDuration = lockDuration;
        _params.amount = amount;
        _params.name = name;
        _params.slippage = slippage;

        depositIds = vault.deposit(_params);

    }

    function withdrawUp(address _to, uint64 amount) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008e0000, 1037618708622) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008e0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008e1000, _to) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008e1001, amount) }
        vault.withdraw(_to, depositIds);
    }

}
