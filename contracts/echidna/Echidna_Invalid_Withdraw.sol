// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";
import {IVault} from "../vault/IVault.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract Echidna_Invalid_Withdraw is Helper,ERC721Holder {

    // zero address should always revert
    function withdraw_zero_address_recipient(uint256[] memory _ids) internal {
        withdraw_should_revert(address(0), _ids);
    }

    // withdraw without a deposit or beneficiary
    function withdraw_without_any_yield(address recipient, uint256[] memory _ids) internal {
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
}
