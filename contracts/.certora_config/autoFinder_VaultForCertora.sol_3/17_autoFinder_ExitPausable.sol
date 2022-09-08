// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";

/**
 * @dev Contract module which allows children to implement an exit stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotExitPaused` and `whenExitPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract ExitPausable is Context {
    /**
     * @dev Emitted when the exitPause is triggered by `account`.
     */
    event ExitPaused(address account);

    /**
     * @dev Emitted when the exitPause is lifted by `account`.
     */
    event ExitUnpaused(address account);

    bool private _exitPaused;

    /**
     * @dev Initializes the contract in exitUnpaused state.
     */
    constructor() {
        _exitPaused = false;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not exitPaused.
     *
     * Requirements:
     *
     * - The contract must not be exitPaused.
     */
    modifier whenNotExitPaused() {
        _requireNotExitPaused();
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is exitPaused.
     *
     * Requirements:
     *
     * - The contract must be exitPaused.
     */
    modifier whenExitPaused() {
        _requireExitPaused();
        _;
    }

    /**
     * @dev Returns true if the contract is exitPaused, and false otherwise.
     */
    function exitPaused() public view virtual returns (bool) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00bf0000, 1037618708671) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00bf0001, 0) }
        return _exitPaused;
    }

    /**
     * @dev Throws if the contract is exitPaused.
     */
    function _requireNotExitPaused() internal view virtual {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00a30000, 1037618708643) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00a30001, 0) }
        require(!exitPaused(), "Pausable: ExitPaused");
    }

    /**
     * @dev Throws if the contract is not exitPaused.
     */
    function _requireExitPaused() internal view virtual {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00b90000, 1037618708665) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00b90001, 0) }
        require(exitPaused(), "Pausable: not ExitPaused");
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be exitPaused.
     */
    function _exitPause() internal virtual logInternal201()whenNotExitPaused {
        _exitPaused = true;
        emit ExitPaused(_msgSender());
    }modifier logInternal201() {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00c90000, 1037618708681) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00c90001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00c90002, 0) } _; }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be exitPaused.
     */
    function _exitUnpause() internal virtual logInternal202()whenExitPaused {
        _exitPaused = false;
        emit ExitUnpaused(_msgSender());
    }modifier logInternal202() {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00ca0000, 1037618708682) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00ca0001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00ca0002, 0) } _; }
}
