// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";
import {IVault} from "../vault/IVault.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract Echidna_Invalid_Withdraw is Helper,ERC721Holder {

    uint256 amount;
    uint64 lockDuration;
    uint256[] depositIds;
    uint256 time;
    bool init = false;

    // changes the deposit
    function change_deposit(IVault.DepositParams memory _params) public {

        if (init) {
            return;
        }

        _params.lockDuration = 2 weeks + (_params.lockDuration % (22 weeks));
        lockDuration = _params.lockDuration;
        emit Log("lockDuration", lockDuration);

        _params.amount = Helper.one_to_max_uint64(_params.amount);
        amount = _params.amount;
        emit Log("amount", amount);

        Helper.mint_helper(address(this), amount);

        populate_claims(10000, _params.claims);
        depositIds = vault.deposit(_params);

        time = block.timestamp;
        init = true;
    }

    // withdraw with less than was deposited should always succeed if
    // lockduration has passed, else always revert
    function withdraw_all() public {

        if (!init) {
            return;
        }

        emit Log("amount", amount);
        emit Log("lockDuration", lockDuration);
        emit Log("time", time);

        uint256 balance_this_before = underlying.balanceOf(address(this));
        uint256 balance_vault_before = vault.totalUnderlying();

        emit Log("balance of this before", balance_this_before);
        emit Log("balance of vault before", balance_vault_before);

        if (block.timestamp > time + lockDuration) {
            withdraw_should_succeed(address(this), depositIds);
            init = false;

            uint256 balance_this_after = underlying.balanceOf(address(this));
            uint256 balance_vault_after = vault.totalUnderlying();

            emit Log("balance of this after", balance_this_after);
            emit Log("balance of vault after", balance_vault_after);

            assert(balance_vault_after == balance_vault_before - amount);
            assert(balance_this_after == balance_this_before + amount);
        } else {
            withdraw_should_revert(address(this), depositIds);
        }
    }
}
