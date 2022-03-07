// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";
import {IVault} from "../vault/IVault.sol";

contract Echidna_Deposit_Withdraw is Helper {

    event WithdrawFailed(string reason, uint256 amount);

    // zero address should always revert
    function withdraw_zero_address_recipient(uint256[] memory _ids) public {
        withdraw_should_revert(address(0), _ids);
    }

    // withdraw without a deposit or beneficiary
    function withdraw_without_any_yield(address recipient, uint256[] memory _ids) public {
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
    function deposit_with_zero_amount() internal {

    }

    // deposit with claim percentage zero should always revert
    function deposit_claim_pct_zero() internal {

    }

    // deposit with non-valid lockduration should always revert
    function deposit_invalid_lockduration() internal {

    }

    // deposit with claims not totalling exactly 100 percent should always revert
    function deposit_claims_dont_add_to_100() internal {

    }

    // deposit with valid params should always succeed 
    function deposit_valid_params() internal {

        // assert vault balanceAfter == balanceBefore + _amount

        // assert user balanceAfter == balanceBefore - _amount
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

    function deposit_should_revert(IVault.DepositParams calldata _params) internal {
        try vault.deposit(_params) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function deposit_should_succeed(IVault.DepositParams calldata _params) internal {
        try vault.deposit(_params) {
            assert(true);
        } catch {
            assert(false);
        }
    }
}
