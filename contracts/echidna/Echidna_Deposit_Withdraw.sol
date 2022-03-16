// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";
import {IVault} from "../vault/IVault.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract Echidna_Deposit_Withdraw is Helper,ERC721Holder {

    // zero address should always revert
    function withdraw_zero_address_recipient(uint256[] memory _ids) public {
        withdraw_should_revert(address(0), _ids);
    }

    // withdraw without a deposit or beneficiary
    function withdraw_without_any_yield(address recipient, uint256[] memory _ids) public {
        require(_ids.length != 0);
        withdraw_should_revert(recipient, _ids);
    }

    // withdraw more than what was deposited always revert
    function withdraw_more_than_deposit() internal {

    }

    // withdraw during the lock period should always revert
    function withdraw_during_lock_period() internal {
        // needs time   
    }

    // withdraw with less than was deposited should always succeed
    function withdraw_less_than_deposited() internal {
        // needs time 
    }

    // deposit zero should always revert
    function deposit_with_zero_amount(IVault.DepositParams memory _params) public {

        _params.lockDuration = 2 weeks + (_params.lockDuration % (22 weeks));
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = 0; 
        emit Log("amount", _params.amount);

        _params.claims[0].pct = 10000;
        _params.claims[0].beneficiary = address(0x000000000000000000000000000000000000dEaD);
        _params.claims[0].data = "0x7b";

        deposit_should_revert(_params);
    }

    // deposit with claim percentage zero should always revert
    function deposit_claim_pct_zero(IVault.DepositParams memory _params) public {
         _params.lockDuration = 2 weeks + (_params.lockDuration % (22 weeks));
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = Helper.one_to_max_uint64(_params.amount);
        emit Log("amount", _params.amount);

        _params.claims[0].pct = 0;
        _params.claims[0].beneficiary = address(0x000000000000000000000000000000000000dEaD);
        _params.claims[0].data = "0x7b";

        deposit_should_revert(_params);
    }

    // deposit with invalid lockduration should always revert
    function deposit_invalid_lockduration_1(IVault.DepositParams memory _params) public {
        _params.lockDuration = (_params.lockDuration % (2 weeks - 1));
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = Helper.one_to_max_uint64(_params.amount);
        emit Log("amount", _params.amount);

        _params.claims[0].pct = 10000;
        _params.claims[0].beneficiary = address(0x000000000000000000000000000000000000dEaD);
        _params.claims[0].data = "0x7b";

        deposit_should_revert(_params);
    }

    // deposit with invalid lockduration should always revert
    function deposit_invalid_lockduration_2(IVault.DepositParams memory _params) public {
        _params.lockDuration += 24 weeks;
        emit Log("lockDuration", _params.lockDuration);

        require(_params.claims.length != 0);

        require(_params.amount != 0);

        deposit_should_revert(_params);
    }

    // deposit with claims not totalling exactly 100 percent should always revert
    function deposit_claims_dont_add_to_100() internal {

    }

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

        uint16 length = uint16(_params.claims.length);
        uint16 left = 10000;
        for (uint16 i = length; i > 1; --i) {
            _params.claims[i - 1].pct = 1 + (_params.claims[i - 1].pct % (left - i - 1));
            left -= _params.claims[i - 1].pct;
            _params.claims[i - 1].beneficiary = carol;
            emit Log("pct", _params.claims[i - 1].pct);
        }

        _params.claims[0].pct = left;
        _params.claims[0].beneficiary = carol;
        emit Log("pct", _params.claims[0].pct);

        deposit_should_succeed(_params);

        uint256 balance_this_after = underlying.balanceOf(address(this));
        uint256 balance_vault_after = underlying.balanceOf(address(vault));

        emit Log("balance of this after", balance_this_after);
        emit Log("balance of vault after", balance_vault_after);

        assert(balance_vault_after == balance_vault_before + _params.amount);
        assert(balance_this_after == balance_this_before - _params.amount);
    }
}
