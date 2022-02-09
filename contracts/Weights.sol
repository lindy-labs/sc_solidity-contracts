// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import "hardhat/console.sol";

/// #invariant {:msg "Shares don't add up"}
///   unchecked_sum(claimShares) + unchecked_sum(claimedShares) == unchecked_sum(depositShares);
contract Weights {
    using SafeERC20 for IERC20;
    using Address for address;

    uint256 public constant SHARES_MULTIPLIER = 10**18;

    // deposits
    mapping(uint256 => bool) public active;
    mapping(uint256 => address) public claimers;
    mapping(uint256 => uint256) public depositPrincipals;
    mapping(uint256 => uint256) public depositShares; // deposit initial shares

    // claims
    mapping(address => uint256) public claimPrincipals;
    mapping(address => uint256) public claimShares;
    mapping(address => uint256) public claimedShares;

    // sponsors
    mapping(address => uint256) public sponsor;
    mapping(uint256 => uint256) public sponsorPrincipal;

    uint256 totalDeposits;
    mapping(address => uint256) public _balances;

    uint256 public balance;
    uint256 public totalShares;
    uint256 public totalPrincipal;

    function addYield(uint256 _amount) external {
        balance += _amount;
    }

    function removeYield(uint256 _amount) external {
        balance -= _amount;
    }

    /// at a loss: balance < totalPrincipal

    function yieldFor(address _claimer) public view returns (uint256) {
        uint256 cPrincipal = claimPrincipals[_claimer];
        uint256 cShares = claimShares[_claimer];

        uint256 computedPrincipal = _computeAmount(
            cShares,
            totalShares,
            balance
        );

        if (computedPrincipal <= cPrincipal) {
            return 0;
        }

        return computedPrincipal - cPrincipal;
    }

    /// #if_succeeds totalShares > old(totalShares);
    ///
    /// #if_succeeds {:msg "Value per share shifted"}
    ///   _computeShares(1, old(totalShares), old(balance)) == _computeShares(1, old(totalShares), old(balance));
    function deposit(uint256 _amount, address _claimer) public virtual {
        uint256 principal = totalPrincipal;

        require(_amount != 0, "Vault: cannot deposit 0");
        require(totalPrincipal <= balance, "Loss");

        uint256 newShares = _computeShares(_amount, totalShares, balance);

        // create deposit
        _createDeposit(_claimer, _amount, newShares);

        // update claim
        claimPrincipals[_claimer] += _amount;
        claimShares[_claimer] += newShares;

        // update totals
        totalShares += newShares;
        totalPrincipal += _amount;
        balance += _amount;
    }

    function claimYield(address _claimer) external {
        uint256 yield = yieldFor(_claimer);

        if (yield == 0) return;

        uint256 shares = _computeShares(yield, totalShares, balance);
        uint256 amount = _computeAmount(shares, totalShares, balance);

        // update claim
        claimShares[_claimer] -= shares;
        claimedShares[_claimer] += shares;

        // update global counts
        totalShares -= shares;
        balance -= amount;
    }

    /// invariant balance > totalPrincipal && old(balance) - balance == old(totalPrincipal) - totalPrincipal
    function withdraw(uint256 _id) external {
        require(active[_id], "not a valid deposit");

        uint256 sharesToBurn = _computeShares(
            depositPrincipals[_id],
            totalShares,
            balance
        );

        address claimer = claimers[_id];

        bool lostMoney = sharesToBurn > depositShares[_id] ||
            sharesToBurn > claimShares[claimer];

        require(lostMoney == false, "Loss");

        // update claim
        claimShares[claimer] -= sharesToBurn;
        claimPrincipals[claimer] -= depositPrincipals[_id];

        // deduct amount from vault
        uint256 amount = _computeAmount(
            depositShares[_id],
            totalShares,
            balance
        );

        // update totals
        balance -= amount;
        totalShares -= depositShares[_id];
        totalPrincipal -= depositPrincipals[_id];

        // burn deposit
        active[_id] = false;
        depositShares[_id] -= sharesToBurn;
    }

    function sponsor(uint256 _amount) external {
        sponsorPrincipal[msg.sender] += _amount;

        balance += _amount;
        totalPrincipal += amount;
    }

    function unsponsor(uint256 _amount) external {
        sponsorPrincipal[msg.sender] -= _amount;

        balance -= amount;
        totalPrincipal -= amount;
    }

    function _computeShares(
        uint256 _amount,
        uint256 _totalShares,
        uint256 _balance
    ) internal pure returns (uint256) {
        if (_amount == 0) return 0;
        if (_totalShares == 0) return _amount * SHARES_MULTIPLIER;

        require(
            _balance != 0,
            "Vault: cannot compute shares when there's no principal"
        );

        return (_amount * _totalShares) / _balance;
    }

    function _computeAmount(
        uint256 _shares,
        uint256 _totalShares,
        uint256 _balance
    ) internal pure returns (uint256) {
        if (_totalShares == 0 || _balance == 0) {
            return 0;
        } else {
            return ((_balance * _shares) / _totalShares);
        }
    }

    function _createDeposit(
        address _claimer,
        uint256 _amount,
        uint256 _shares
    ) internal {
        uint256 id = totalDeposits;

        active[id] = true;
        claimers[id] = _claimer;
        depositPrincipals[id] = _amount;
        depositShares[id] = _shares;
        totalDeposits++;
    }
}
