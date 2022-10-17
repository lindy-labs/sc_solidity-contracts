// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {Vault} from "../../Vault.sol";
import {MockERC20} from "../../mock/MockERC20.sol";

contract VaultForCertora {

    Vault vault;
    MockERC20 underlying;
    uint256[] depositIds = [0]; // Certora does not support array return

    function mint_helper(address recip, uint256 amount) public {
        underlying.mint(recip, amount);
        underlying.approve(address(vault), amount);
    }

    function depositParts(uint64 lockDuration, uint64 amount, string memory name, uint256 slippage) public {
        /*Vault.DepositParams memory _params;

        _params.inputToken = address(underlying);
        _params.lockDuration = 2 weeks + (lockDuration % (22 weeks));//lockDuration;
        _params.amount = amount;
        _params.name = name;
        _params.slippage = slippage;

        depositIds = vault.deposit(_params);
*/
    }

    function withdrawUp(address _to, uint64 amount) public {
        vault.withdraw(_to, depositIds);
    }

}
