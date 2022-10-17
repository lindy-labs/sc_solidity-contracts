// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Vault } from '/Users/alexandremota/Desktop/LindyLabs/sc_solidity-contracts/contracts/autoFinder_Vault.sol';
import { MockERC20 } from '/Users/alexandremota/Desktop/LindyLabs/sc_solidity-contracts/contracts/mock/autoFinder_MockERC20.sol';

contract VaultForCertora {

    Vault vault;
    MockERC20 underlying;
    uint256[] depositIds = [0]; // Certora does not support array return

    function mint_helper(address recip, uint256 amount) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fc0000, 1037618708732) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fc0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fc1000, recip) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fc1001, amount) }
        underlying.mint(recip, amount);
        underlying.approve(address(vault), amount);
    }

    function depositParts(uint64 lockDuration, uint64 amount, string memory name, uint256 slippage) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fd0000, 1037618708733) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fd0001, 4) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fd1000, lockDuration) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fd1001, amount) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fd1002, name) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fd1003, slippage) }
        Vault.DepositParams memory _params;

        _params.inputToken = address(underlying);
        _params.lockDuration = 2 weeks + (lockDuration % (22 weeks));//lockDuration;
        _params.amount = amount;
        _params.name = name;
        _params.slippage = slippage;

        //depositIds = vault.deposit(_params);

    }

    function withdrawUp(address _to, uint64 amount) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fe0000, 1037618708734) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fe0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fe1000, _to) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fe1001, amount) }
        vault.withdraw(_to, depositIds);
    }

}
