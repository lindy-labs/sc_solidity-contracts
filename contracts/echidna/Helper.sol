// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Addresses.sol";

contract Helper is Addresses {

    event Log(string reason, uint256 amount);
    event LogAddress(string reason, address a);
    
    function mint_helper(address recip, uint256 amount) internal {
        underlying.mint(recip, amount);
        underlying.approve(address(vault), amount);
    }

    function one_to_max_uint64(uint256 random) internal pure returns (uint256) {
        return 1 + (random % (type(uint64).max - 1));
    }

    function populate_claims(uint16 pctTotal, IVault.ClaimParams[] memory _claims) internal {
        uint16 length = uint16(_claims.length);
        uint16 left = pctTotal;
        for (uint16 i = length; i > 1; --i) {
            _claims[i - 1].pct = 1 + (_claims[i - 1].pct % (left - i - 1));
            left -= _claims[i - 1].pct;
            _claims[i - 1].beneficiary = bob;
            emit Log("pct", _claims[i - 1].pct);
        }
        _claims[0].pct = left;
        _claims[0].beneficiary = address(this);
        emit Log("pct", _claims[0].pct);
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
