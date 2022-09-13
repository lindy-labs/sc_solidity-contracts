// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { Vault } from '/Users/alexandremota/Desktop/LindyLabs/sc_solidity-contracts/contracts/autoFinder_Vault.sol';
import {MockERC20} from "../../mock/MockERC20.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract SponsorForCertora is ERC721Holder {

    Vault vault;
    MockERC20 underlying;

    function sponsor(uint256 _amount, uint256 _lockDuration, uint256 _slippage) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d0000, 1037618708621) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d0001, 3) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1000, _amount) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1001, _lockDuration) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff008d1002, _slippage) }

        underlying.approve(address(vault), _amount);

        vault.sponsor(address(underlying), _amount, _lockDuration, _slippage);

    }

}
