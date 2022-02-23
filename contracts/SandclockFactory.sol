// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract SandclockFactory is Context, AccessControl {
    //
    // Constants
    //
    bytes32 public constant DEPLOYER_ROLE = keccak256("DEPLOYER_ROLE");

    //
    // Events
    //

    event NewVault(address indexed vault, uint256 salt);

    //
    // Constructor
    //

    constructor(address _owner) {
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(DEPLOYER_ROLE, msg.sender);
    }

    //
    // Public API
    //

    function deployVault(bytes memory code, uint256 salt)
        external
        onlyRole(DEPLOYER_ROLE)
    {
        address addr = deploy(code, salt);

        emit NewVault(addr, salt);
    }

    //
    // Internal
    //

    function deploy(bytes memory code, uint256 salt)
        internal
        onlyRole(DEPLOYER_ROLE)
        returns (address)
    {
        address addr;
        assembly {
            addr := create2(0, add(code, 0x20), mload(code), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }

        return addr;
    }
}
