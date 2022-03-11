// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";
import {IVault} from "../vault/IVault.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract Echidna_Deposit_Withdraw is Helper,ERC721Holder {

    event Log(string reason, uint256 amount);
    event LogAddress(string reason, address a);

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
    function deposit_valid_params() internal {

        // assert vault balanceAfter == balanceBefore + _amount

        // assert user balanceAfter == balanceBefore - _amount
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

    function deposit_should_revert(IVault.DepositParams memory _params) internal {
        try vault.deposit(_params) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function deposit_should_succeed(IVault.DepositParams memory _params) internal {
        try vault.deposit(_params) {
            assert(true);
        } catch {
            assert(false);
        }
    }
}
