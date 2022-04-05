// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";
import {IVault} from "../vault/IVault.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract Echidna_Invalid_Deposit is Helper,ERC721Holder {

    // deposit zero should always revert
    function deposit_with_zero_amount(IVault.DepositParams memory _params) public {
        _params.lockDuration = 2 weeks + (_params.lockDuration % (22 weeks));
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = 0;
        emit Log("amount", _params.amount);

        Helper.mint_helper(address(this), _params.amount);
        populate_claims(10000, _params.claims);
        _params.inputToken = address(underlying);
        deposit_should_revert(_params);
    }

    // deposit with any claim percentage zero should always revert
    function deposit_claim_pct_zero(IVault.DepositParams memory _params) public {
        _params.lockDuration = 2 weeks + (_params.lockDuration % (22 weeks));
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = Helper.one_to_max_uint64(_params.amount);
        emit Log("amount", _params.amount);

        Helper.mint_helper(address(this), _params.amount);
        populate_claims(10000, _params.claims);
        _params.claims[_params.amount % _params.claims.length].pct = 0;
        _params.inputToken = address(underlying);
        deposit_should_revert(_params);
    }

    // deposit with invalid lockduration should always revert
    function deposit_invalid_lockduration_1(IVault.DepositParams memory _params) public {

        _params.lockDuration = (_params.lockDuration % (2 weeks));
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = Helper.one_to_max_uint64(_params.amount);
        emit Log("amount", _params.amount);

        Helper.mint_helper(address(this), _params.amount);
        populate_claims(10000, _params.claims);
        _params.inputToken = address(underlying);
        deposit_should_revert(_params);
    }

    // deposit with invalid lockduration should always revert
    function deposit_invalid_lockduration_2(IVault.DepositParams memory _params) public {
        _params.lockDuration = 1 + 24 weeks + _params.lockDuration;
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = Helper.one_to_max_uint64(_params.amount);
        emit Log("amount", _params.amount);

        Helper.mint_helper(address(this), _params.amount);
        populate_claims(10000, _params.claims);
        _params.inputToken = address(underlying);
        deposit_should_revert(_params);
    }

    // deposit with claims not totalling exactly 100 percent should always revert
    function deposit_claims_more_than_100(IVault.DepositParams memory _params) public {

        _params.lockDuration = 2 weeks + (_params.lockDuration % (22 weeks));
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = Helper.one_to_max_uint64(_params.amount); 
        emit Log("amount", _params.amount);

        Helper.mint_helper(address(this), _params.amount);
        populate_claims(10000 + (uint16(_params.amount) % (type(uint16).max - 10000)), _params.claims);
        _params.inputToken = address(underlying);
        deposit_should_revert(_params);
    }

    // deposit with claims not totalling exactly 100 percent should always revert
    function deposit_claims_less_than_100(IVault.DepositParams memory _params) public {
        _params.lockDuration = 2 weeks + (_params.lockDuration % (22 weeks));
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = Helper.one_to_max_uint64(_params.amount); 
        emit Log("amount", _params.amount);

        Helper.mint_helper(address(this), _params.amount);
        populate_claims(uint16(_params.amount) % 9999, _params.claims);
        _params.inputToken = address(underlying);
        deposit_should_revert(_params);
    }

    // deposit with input token not swappable should always revert
    function deposit_swappable_no_pool(IVault.DepositParams memory _params) public {
        _params.lockDuration = 2 weeks + (_params.lockDuration % (22 weeks));
        emit Log("lockDuration", _params.lockDuration);

        _params.amount = Helper.one_to_max_uint64(_params.amount);
        emit Log("amount", _params.amount);

        require(_params.inputToken != address(underlying));

        MockERC20(_params.inputToken).mint(address(this), _params.amount);
        MockERC20(_params.inputToken).approve(address(vault), _params.amount);
        populate_claims(10000, _params.claims);
        deposit_should_revert(_params);
    }
}
