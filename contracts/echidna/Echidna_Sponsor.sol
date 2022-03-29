// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";
import {IVault} from "../vault/IVault.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract Echidna_Sponsor is Helper,ERC721Holder {

    // add sponsor with valid params should never revert
    function sponsor_should_succeed(uint256 _amount, uint256 _lockDuration) public {

        _lockDuration = 2 weeks + (_lockDuration % (22 weeks));
        emit Log("lockDuration", _lockDuration);

        _amount = Helper.one_to_max_uint64(_amount);
        emit Log("amount", _amount);

        Helper.mint_helper(address(this), _amount);

        uint256 balance_this_before = underlying.balanceOf(address(this));
        uint256 balance_vault_before = vault.totalSponsored();
        emit Log("balance of this before", balance_this_before);
        emit Log("total sponsored of vault before", balance_vault_before);

        try vault.sponsor(_amount, _lockDuration) {
            assert(true);
        } catch {
            assert(false);
        }

        uint256 balance_this_after = underlying.balanceOf(address(this));
        uint256 balance_vault_after = vault.totalSponsored();

        emit Log("balance of this after", balance_this_after);
        emit Log("total sponsored of vault after", balance_vault_after);

        assert(balance_vault_after == balance_vault_before + _amount);
        assert(balance_this_after == balance_this_before - _amount);
    }
}
