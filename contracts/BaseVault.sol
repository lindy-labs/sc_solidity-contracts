// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {Trust} from "@rari-capital/solmate/src/auth/Trust.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {Depositors} from "./vault/Depositors.sol";
import {Claimers} from "./vault/Claimers.sol";
import {PercentMath} from "./lib/PercentMath.sol";

contract BaseVault {
    using Counters for Counters.Counter;
    using PercentMath for uint256;

    uint256 public constant SHARES_MULTIPLIER = 10**18;

    /// Unique IDs to correlate donations that belong to the same foundation
    Counters.Counter internal depositGroupIds;

    struct Deposit {
        /// amount of the deposit
        uint256 amount;
        /// wallet of the claimer
        uint256 claimerId;
        /// when can the deposit be withdrawn
        uint256 lockedUntil;
        /// the number of shares issued for this deposit
        uint256 shares;
    }

    mapping(uint256 => Deposit) public deposits;
    Counters.Counter internal _depositIds;

    struct Claimer {
        uint256 totalPrincipal;
        uint256 totalShares;
    }

    mapping(uint256 => Claimer) public claimer;
    Counters.Counter internal _claimerIds;

    // The total of shares
    uint256 public totalShares;

    // The total of principal deposited
    uint256 public totalPrincipal;

    /**
     * Removes the principal and shares of a deposit.
     * If there is any yield to be claimed, it will stay with the claimer.
     *
     * @notice If the vault underperformed and lost money, the deposit will be
     * valued at a percentage of the total deposited.
     *
     * @param _depositId The deposit ID to withdraw from.
     * @param _totalShares The total shares to consider for the withdraw.
     * @param _totalUnderlying The total underlying to consider for the withdraw.
     * @param _to Where the funds will be sent
     * @param _force If the withdraw should still withdraw if there are not enough funds in the vault.
     *
     * @return deleted shares
     * @return amount to withdraw.
     */
    function _withdraw(
        uint256 _depositId,
        uint256 _totalShares,
        uint256 _totalUnderlying,
        address _to,
        bool _force
    ) internal returns (uint256, uint256) {
        uint256 claimerId = deposits[_depositId].claimerId;
        uint256 depositInitialShares = deposits[_depositId].shares;
        uint256 depositAmount = deposits[_depositId].amount;

        uint256 claimerShares = claimer[claimerId].totalShares;
        uint256 claimerPrincipal = claimer[claimerId].totalPrincipal;

        uint256 depositShares = _computeShares(
            depositAmount,
            _totalShares,
            _totalUnderlying
        );

        bool lostMoney = depositShares > depositInitialShares ||
            depositShares > claimerShares;

        if (_force && lostMoney) {
            // When there's a loss it means that a deposit is now worth more
            // shares than before. In that scenario, we cannot allow the
            // depositor to withdraw all her money. Instead, the depositor gets
            // a number of shares that are equivalent to the percentage of this
            // deposit in the total deposits for this claimer.
            depositShares = (depositAmount * claimerShares) / claimerPrincipal;
        } else {
            require(
                lostMoney == false,
                "Vault: cannot withdraw more than the available amount"
            );
        }

        claimer[claimerId].totalShares -= depositShares;
        claimer[claimerId].totalPrincipal -= depositAmount;

        totalShares -= depositShares;
        totalPrincipal -= depositAmount;

        return (
            depositShares,
            _computeAmount(depositShares, _totalShares, _totalUnderlying)
        );
    }

    /**
     * Creates a deposit with the given params.
     *
     * @notice The lock period is not enforced by this function.
     *
     * @param _claimerId ID of the claimer.
     * @param _depositId ID of the deposit.
     * @param _amount Deposit amount.
     * @param _lockedUntil When the depositor can withdraw the deposit.
     * @param _localTotalShares Global total of shares to consider.
     * @param _localTotalPrincipal Global total of principal to consider.
     *
     * @return number of shares minted for the deposit.
     */
    function _deposit(
        uint256 _claimerId,
        uint256 _depositId,
        uint256 _amount,
        uint256 _lockedUntil,
        uint256 _localTotalShares,
        uint256 _localTotalPrincipal
    ) internal returns (uint256) {
        uint256 newShares = _computeShares(
            _amount,
            _localTotalShares,
            _localTotalPrincipal
        );

        claimer[_claimerId].totalShares += newShares;
        claimer[_claimerId].totalPrincipal += _amount;

        totalShares += newShares;
        totalPrincipal += _amount;

        deposits[_depositId] = Deposit(
            _amount,
            _claimerId,
            _lockedUntil,
            newShares
        );

        return newShares;
    }

    /**
     * Claims the yield for a claimer.
     *
     * @param _claimerId ID of the claimer.
     *
     * @return claimed shares.
     * @return amount to transfer.
     */
    function _claimYield(uint256 _claimerId)
        internal
        returns (uint256, uint256)
    {
        uint256 yield = _yieldFor(_claimerId);

        if (yield == 0) return (0, 0);

        uint256 shares = _computeShares(yield, totalShares, totalUnderlying());

        uint256 sharesAmount = _computeAmount(
            shares,
            totalShares,
            totalUnderlying()
        );

        claimer[_claimerId].totalShares -= shares;
        totalShares -= shares;

        return (shares, sharesAmount);
    }

    /**
     * Calulates the yield available for a claimer.
     *
     * @param _claimerId ID of the claimer.
     *
     * @return amount available to claim.
     */
    function _yieldFor(uint256 _claimerId) internal view returns (uint256) {
        uint256 claimerPrincipal = claimer[_claimerId].totalPrincipal;
        uint256 claimerShares = claimer[_claimerId].totalShares;

        uint256 currentClaimerPrincipal = _computeAmount(
            claimerShares,
            totalShares,
            totalUnderlying()
        );

        if (currentClaimerPrincipal <= claimerPrincipal) {
            return 0;
        }

        return currentClaimerPrincipal - claimerPrincipal;
    }

    /**
     * Computes the amount of underlying from a given number of shares
     *
     * @param _shares Number of shares.
     * @param _totalShares Amount of existing shares to consider.
     * @param _totalUnderlying Amounf of existing underlying to consider.
     *
     * @return Amount that corresponds to the number of shares.
     */
    function _computeAmount(
        uint256 _shares,
        uint256 _totalShares,
        uint256 _totalUnderlying
    ) internal pure returns (uint256) {
        if (_totalShares == 0 || _totalUnderlying == 0) {
            return 0;
        } else {
            return ((_totalUnderlying * _shares) / _totalShares);
        }
    }

    /**
     * Computes amount of shares that will be received for a given deposit amount
     *
     * @param _amount Amount of deposit to consider.
     * @param _totalShares Amount of existing shares to consider.
     * @param _totalUnderlying Amounf of existing underlying to consider.
     *
     * @return Amount of shares the deposit will receive.
     */
    function _computeShares(
        uint256 _amount,
        uint256 _totalShares,
        uint256 _totalUnderlying
    ) internal pure returns (uint256) {
        if (_amount == 0) return 0;
        if (_totalShares == 0) return _amount * SHARES_MULTIPLIER;

        require(
            _totalUnderlying != 0,
            "Vault: cannot compute shares when there's no principal"
        );

        return (_amount * _totalShares) / _totalUnderlying;
    }

    function totalUnderlying() public view virtual returns (uint256) {}
}
