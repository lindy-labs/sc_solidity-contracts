// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";

contract Echidna_Deposit_Withdraw is Helper {

    uint256 internal constant MIN_SPONSOR_LOCK_DURATION = 2 weeks;
    uint256 internal constant MAX_SPONSOR_LOCK_DURATION = 24 weeks;

    // zero address should always revert
    function withdraw_zero_address_recipient(uint256[] memory _ids) public {
        withdraw_should_revert(address(0), _ids);
    }

    // adding sponsor should never revert with valid inputs
    function sponsor_valid_params(uint256 _amount, uint256 _lockDuration) public {
        require(_amount > 0);
        require(_lockDuration >= MIN_SPONSOR_LOCK_DURATION);
        require(_lockDuration <= MAX_SPONSOR_LOCK_DURATION);
        mint_helper(address(this), _amount);
        (bool success, ) = address(vault).call(
            abi.encodeWithSignature("sponsor(uint256,uint256)", _amount, _lockDuration)
        );
        if (!success) {
            assert(false);
            return;
        }
    }
    
    function withdraw_should_revert(address recipient, uint256[] memory _ids) internal {
        try vault.withdraw(recipient, _ids) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function withdraw_should_succeed(address recipient, uint256[] memory _ids) internal {
        (bool success, ) = address(vault).call(
            abi.encodeWithSignature("withdraw(address,uint256[])", recipient, _ids)
        );
        if (!success) {
            assert(false);
            return;
        }
    }
}
