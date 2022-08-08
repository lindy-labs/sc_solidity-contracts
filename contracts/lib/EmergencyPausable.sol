// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotEmergencyPaused` and `whenEmergencyPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract EmergencyPausable is Context {
    /**
     * @dev Emitted when the emergencyPause is triggered by `account`.
     */
    event EmergencyPaused(address account);

    /**
     * @dev Emitted when the emergencyPause is lifted by `account`.
     */
    event EmergencyUnemergencyPaused(address account);

    bool private _emergencyPaused;

    /**
     * @dev Initializes the contract in emergencyUnpaused state.
     */
    constructor() {
        _emergencyPaused = false;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not emergencyPaused.
     *
     * Requirements:
     *
     * - The contract must not be emergencyPaused.
     */
    modifier whenNotEmergencyPaused() {
        _requireNotEmergencyPaused();
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is emergencyPaused.
     *
     * Requirements:
     *
     * - The contract must be emergencyPaused.
     */
    modifier whenEmergencyPaused() {
        _requireEmergencyPaused();
        _;
    }

    /**
     * @dev Returns true if the contract is emergencyPaused, and false otherwise.
     */
    function emergencyPaused() public view virtual returns (bool) {
        return _emergencyPaused;
    }

    /**
     * @dev Throws if the contract is emergencyPaused.
     */
    function _requireNotEmergencyPaused() internal view virtual {
        require(!emergencyPaused(), "Pausable: EmergencyPaused");
    }

    /**
     * @dev Throws if the contract is not emergencyPaused.
     */
    function _requireEmergencyPaused() internal view virtual {
        require(emergencyPaused(), "Pausable: not EmergencyPaused");
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be emergencyPaused.
     */
    function _emergencyPause() internal virtual whenNotEmergencyPaused {
        _emergencyPaused = true;
        emit EmergencyPaused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be emergencyPaused.
     */
    function _emergencyUnpause() internal virtual whenEmergencyPaused {
        _emergencyPaused = false;
        emit EmergencyUnemergencyPaused(_msgSender());
    }
}
