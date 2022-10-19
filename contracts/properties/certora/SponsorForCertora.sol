// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {Vault} from "../../Vault.sol";
import {MockERC20} from "../../mock/MockERC20.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract SponsorForCertora is ERC721Holder {

    Vault vault;
    MockERC20 underlying;

    function sponsor(uint256 _amount, uint256 _lockDuration, uint256 _slippage) public {

        underlying.approve(address(vault), _amount);

        vault.sponsor(address(underlying), _amount, _lockDuration, _slippage);

    }

}
