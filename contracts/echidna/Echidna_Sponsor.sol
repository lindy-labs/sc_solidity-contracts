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

        uint256 totalshares_vault_before = vault.totalShares();
        emit Log("totalShares of vault before", totalshares_vault_before);

        uint256 totalprincipal_vault_before = vault.totalPrincipal();
        emit Log("totalPrincipal of vault before", totalprincipal_vault_before);

        uint256 totalunderlying_vault_before = vault.totalUnderlying();
        emit Log("totalUnderlying of vault before", totalunderlying_vault_before);

        try vault.sponsor(address(underlying), _amount, _lockDuration, 5) {
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

        emit Log("totalShares of vault after", vault.totalShares());
        assert(vault.totalShares() == totalshares_vault_before);

        emit Log("totalPrincipal of vault after", vault.totalPrincipal());
        assert(vault.totalPrincipal() == totalprincipal_vault_before);

        emit Log("totalUnderlying of vault after", vault.totalUnderlying());
        assert(vault.totalUnderlying() == totalunderlying_vault_before + _amount);
    }

    // sponsor zero should always revert
    function sponsor_with_zero_amount(uint256 lockDuration) public {
        lockDuration = 2 weeks + (lockDuration % (22 weeks));
        emit Log("lockDuration", lockDuration);
        emit Log("amount", 0);
        sponsor_should_revert(0, lockDuration);
    }

    // sponsor with invalid lockduration should always revert
    function sponsor_invalid_lockduration_1(uint256 amount, uint256 lockDuration) public {

        lockDuration = (lockDuration % (2 weeks));
        emit Log("lockDuration", lockDuration);

        amount = Helper.one_to_max_uint64(amount);
        emit Log("amount", amount);

        Helper.mint_helper(address(this), amount);
        sponsor_should_revert(amount, lockDuration);
    }

    // sponsor with invalid lockduration should always revert
    function sponsor_invalid_lockduration_2(uint256 amount, uint256 lockDuration) public {
        lockDuration = 1 + 24 weeks + lockDuration;
        emit Log("lockDuration", lockDuration);

        amount = Helper.one_to_max_uint64(amount);
        emit Log("amount", amount);

        Helper.mint_helper(address(this), amount);
        sponsor_should_revert(amount, lockDuration);
    }

    function sponsor_should_revert(uint256 _amount, uint256 _lockDuration) internal {
        try vault.sponsor(address(underlying), _amount, _lockDuration, 5) {
            assert(false);
        } catch {
            assert(true);
        }
    }
}
