// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";
import {IVault} from "../vault/IVault.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract Echidna_Valid_Deposit is Helper,ERC721Holder {

    // deposit with valid params should always succeed 
    function deposit_valid_params(IVault.DepositParams memory _params) public {

        _params.lockDuration = 2 weeks + (_params.lockDuration % (22 weeks));
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = Helper.one_to_max_uint64(_params.amount); 
        emit Log("amount", _params.amount);

        Helper.mint_helper(address(this), _params.amount);

        uint256 balance_this_before = underlying.balanceOf(address(this));
        uint256 balance_vault_before = underlying.balanceOf(address(vault));
        emit Log("balance of this before", balance_this_before);
        emit Log("balance of vault before", balance_vault_before);

        populate_claims(10000, _params.claims);

        deposit_should_succeed(_params);

        uint256 balance_this_after = underlying.balanceOf(address(this));
        uint256 balance_vault_after = underlying.balanceOf(address(vault));

        emit Log("balance of this after", balance_this_after);
        emit Log("balance of vault after", balance_vault_after);

        assert(balance_vault_after == balance_vault_before + _params.amount);
        assert(balance_this_after == balance_this_before - _params.amount);
    }
}
