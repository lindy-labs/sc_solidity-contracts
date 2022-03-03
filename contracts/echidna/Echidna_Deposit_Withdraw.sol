// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";

contract Echidna_Deposit_Withdraw is Helper {

    // zero address should always revert
    function withdraw_zero_address_recipient(uint256[] memory _ids) public {
        withdraw_should_revert(address(0), _ids);
    }
    
    function withdraw_should_revert(address recipient, uint256[] memory _ids) internal {
        try vault.withdraw(recipient, _ids) {
            assert(false);
        } catch {
            assert(true);
        }
    }
}
