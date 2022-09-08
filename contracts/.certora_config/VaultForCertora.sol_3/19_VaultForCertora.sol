// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {Vault} from "../../Vault.sol";

contract VaultForCertora {

    Vault vault;

    function depositParts(address inputToken, uint64 lockDuration, uint64 amount, /*string memory name,*/ uint256 slippage) public {
        Vault.DepositParams memory _params;

        _params.inputToken = inputToken;
        _params.lockDuration = lockDuration;
        _params.amount = amount;
        _params.name = "MockERC20";//name;
        _params.slippage = slippage;

        vault.deposit(_params);

    }

}
