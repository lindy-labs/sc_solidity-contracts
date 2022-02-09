// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import {IIntegration} from "../IIntegration.sol";
import {IDCA} from "./IDCA.sol";
import {IVault} from "../../vault/IVault.sol";

import "hardhat/console.sol";

/**
 * DCA logic registerend account positions as a Queue struct
 *
 * This allows vaults to keep constant gas prices when editing account
 * positions, which must later be collapsed and accounted for when calculating
 * the full account balance;
 */
abstract contract DCAQueue is IDCA, Context, ERC165 {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Address for address;

    //
    // Constants
    //
    uint256 public constant MAX_INT = 2**256 - 1;

    //
    // Structs
    //

    struct Purchase {
        uint256 amountBought;
        uint256 totalShares;
    }

    struct Position {
        uint256 start;
        uint256 end;
        uint256 shares;
    }

    struct Deposit {
        address beneficiary;
        uint256 shares;
    }

    struct Queue {
        mapping(uint256 => Position) queue;
        uint256 first;
        uint256 length;
    }

    // TODO this is essentially a Queue struct. maybe abstract that away into a separate lib?
    struct Account {
        Queue positions;
        uint256 reserved;
    }

    //
    // State
    //

    address public override(IDCA) vault;
    Purchase[] public purchases;
    mapping(uint256 => Deposit) public deposits;
    mapping(address => Account) accounts;

    uint256 public totalShares;

    constructor(address _vault) {
        require(
            _vault.isContract() &&
                IERC165(_vault).supportsInterface(type(IVault).interfaceId),
            "DCAQueue: vault does not implement IVault"
        );

        vault = _vault;
    }

    //
    // IDCA
    //

    /**
     * Withdraws all the amount due to an account
     */
    function withdraw() external override(IDCA) {
        Account storage account = accounts[_msgSender()];
        Queue storage positions = account.positions;

        // this check cannot be done inside _collapse since the (length - 1)
        // argument could cause underflow
        if (positions.length > 0) {
            _collapse(
                account,
                positions.first,
                positions.first + positions.length - 1
            );
        }

        uint256 due = account.reserved;

        account.reserved = 0;

        IERC20(this.output()).transfer(_msgSender(), due);

        emit Withdrawn(_msgSender(), due);
    }

    /**
     * Computes total amount due to an account, for all the purchases he had shares in
     *
     * @notice For each purchase made, a user may have a certain position in
     * it. The total due amount is the sum of his position in each share. We
     * can compute this by looping through all relevant purchases, and also
     * looping through the corresponding positions a the same time
     *
     * @dev This is not yet tested, and may need to be limited due to gas-limit
     * reasons
     *
     * @param _account Account to calculate the balance of
     * @return The amount due to the beneficiary
     */
    function balanceOf(address _account)
        external
        view
        override(IDCA)
        returns (uint256)
    {
        Account storage account = accounts[_account];
        Queue storage positions = account.positions;

        uint256 balance = account.reserved;

        uint256 first = positions.first;
        uint256 last = first + positions.length - 1;

        // interate through all purchases and positions at the same time,
        // adding up each amount due to the account
        for (uint256 x = first; x <= last; ++x) {
            Position storage position = positions.queue[x];

            for (
                uint256 y = position.start;
                y <= position.end && y < purchases.length;
                ++y
            ) {
                Purchase storage purchase = purchases[y];

                balance +=
                    (purchase.amountBought * position.shares) /
                    purchase.totalShares;
            }
        }

        return balance;
    }

    //
    // Public API
    //

    /**
     * Collapses multiple closed positions into the account's reserved balance
     *
     * @param _account Account to collapse
     * @param _max Maximum number of positions to close
     */
    function collapse(address _account, uint256 _max) external {
        Account storage account = accounts[_account];
        Queue storage positions = account.positions;

        // nothing to do in this case, and we actually need to avoid underflow
        // in (length - 1) below
        if (positions.length == 0) {
            return;
        }

        uint256 first = positions.first;
        uint256 last = first + positions.length - 1;

        // truncate loop iterations
        if (last > first + _max - 1) {
            last = first + _max - 1;
        }

        _collapse(account, first, last);
    }

    /**
     * Gets a position from an account
     *
     * @param _beneficiary The account to fetch
     * @param _idx The index of the position to read
     * @return The account's latest position
     */
    function getPositionAt(address _beneficiary, uint256 _idx)
        external
        view
        returns (Position memory)
    {
        Account storage account = accounts[_beneficiary];

        return account.positions.queue[_idx];
    }

    /**
     * Gets the last position for an account
     *
     * @param _beneficiary The account to fetch
     * @return The account's latest position
     */
    function getLastPosition(address _beneficiary)
        external
        view
        returns (Position memory)
    {
        Queue storage positions = accounts[_beneficiary].positions;

        return positions.queue[positions.first + positions.length - 1];
    }

    //
    // IIntegration
    //

    /// @notice See IIntegration
    function onDepositMinted(
        uint256 _depositId,
        uint256 _shares,
        bytes calldata _data
    ) external override(IIntegration) returns (bytes4) {
        require(_msgSender() == vault, "DCAQueue: sender is not the vault");

        address beneficiary = bytesToAddress(_data);

        deposits[_depositId] = Deposit({
            beneficiary: beneficiary,
            shares: _shares
        });

        _addShares(beneficiary, _shares);

        emit SharesMinted(beneficiary, _shares);

        return IIntegration(this).onDepositMinted.selector;
    }

    /// @notice See IIntegration
    function onDepositBurned(uint256 _depositId)
        external
        override(IIntegration)
        returns (bytes4)
    {
        // This can only work if a previous {onDepostiMinted} call has been
        // made for the same deposit So this check implicitly ensures the
        // sender is a valid Vault
        require(
            address(_msgSender()) == vault,
            "DCAQueue: sender is not the vault"
        );

        Deposit storage deposit = deposits[_depositId];

        address beneficiary = deposit.beneficiary;
        uint256 shares = deposit.shares;

        _subShares(beneficiary, shares);
        delete deposits[_depositId];

        emit SharesBurned(beneficiary, shares);

        return IIntegration(this).onDepositBurned.selector;
    }

    //
    // ERC165
    //

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165)
        returns (bool)
    {
        return
            interfaceId == type(IIntegration).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    //
    // Internal logic
    //

    function _claimFromVault() internal {
        IVault(vault).claimYield(address(this));
    }

    /**
     * Collapses the given positions of an account
     */
    function _collapse(
        Account storage _account,
        uint256 _first,
        uint256 _last
    ) internal {
        Queue storage positions = _account.positions;
        uint256 newReserved;

        // skip if no positions exist
        if (positions.length == 0) {
            return;
        }

        uint256 x = _first;
        for (; x <= _last; ++x) {
            Position storage position = positions.queue[x];

            for (
                uint256 y = position.start;
                y < purchases.length && y <= position.end;
                ++y
            ) {
                Purchase storage purchase = purchases[y];

                newReserved +=
                    (purchase.amountBought * position.shares) /
                    purchase.totalShares;
            }

            if (position.end == MAX_INT) {
                // if current position still open, we truncate it to the next purchase
                position.start = purchases.length;
            } else {
                // otherwise we delete the position
                delete positions.queue[x];
            }
        }

        // update deque counters
        positions.first = _last;
        positions.length = _last - _first;

        // update reserved amount
        _account.reserved += newReserved;
    }

    /**
     * Converts a byte sequence to address
     *
     * @dev This function requires the byte sequence to have 20 bytes of length
     *
     * @param bs Bytes sequence to decode (must have length 20)
     * @return addr The decoded address
     */
    function bytesToAddress(bytes memory bs)
        private
        pure
        returns (address addr)
    {
        require(bs.length == 20, "invalid data length for address");

        assembly {
            addr := mload(add(bs, 20))
        }
    }

    function _addShares(address _beneficiary, uint256 _delta) internal {
        Queue storage positions = accounts[_beneficiary].positions;

        if (positions.length == 0) {
            positions.queue[0] = Position(purchases.length, MAX_INT, _delta);
            positions.length++;
        } else {
            // at least 1 position already exists
            uint256 lastIdx = positions.first + positions.length - 1;

            Position storage lastPosition = positions.queue[lastIdx];

            if (lastPosition.start >= purchases.length) {
                // current position still unused, replace it

                lastPosition.shares += _delta;
            } else {
                // position used, close it and append
                lastPosition.end = purchases.length - 1;

                positions.queue[lastIdx + 1] = Position(
                    purchases.length,
                    MAX_INT,
                    lastPosition.shares + _delta
                );

                positions.length++;
            }
        }

        totalShares += _delta;

        // TODO emit event
    }

    function _subShares(address _beneficiary, uint256 _delta) internal {
        Queue storage positions = accounts[_beneficiary].positions;

        // at least 1 position already exists
        uint256 lastIdx = positions.first + positions.length - 1;

        Position storage lastPosition = positions.queue[lastIdx];

        if (lastPosition.start >= purchases.length) {
            // current position still unused, replace it

            lastPosition.shares -= _delta;
        } else {
            // position used, close it and append
            lastPosition.end = purchases.length - 1;

            positions.queue[lastIdx + 1] = Position(
                purchases.length,
                MAX_INT,
                lastPosition.shares - _delta
            );

            positions.length++;
        }

        totalShares -= _delta;

        // TODO emit event
    }
}
