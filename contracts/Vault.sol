// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {IVault} from "./vault/IVault.sol";
import {IVaultSponsoring} from "./vault/IVaultSponsoring.sol";
import {PercentMath} from "./lib/PercentMath.sol";
import {Depositors} from "./vault/Depositors.sol";
import {Claimers} from "./vault/Claimers.sol";
import {IStrategy} from "./strategy/IStrategy.sol";

import "hardhat/console.sol";

/**
 * A vault where other accounts can deposit an underlying token
 * currency and set distribution params for their principal and yield
 *
 * @dev Yield generation strategies not yet implemented
 */

contract Vault is
    IVault,
    IVaultSponsoring,
    Context,
    ERC165,
    AccessControl,
    ReentrancyGuard
{
    using Counters for Counters.Counter;
    using SafeERC20 for IERC20;
    using PercentMath for uint256;
    using PercentMath for uint16;

    //
    // Constants
    //

    bytes32 public constant INVESTOR_ROLE = keccak256("INVESTOR_ROLE");
    uint64 public constant MIN_SPONSOR_LOCK_DURATION = 2 weeks;
    uint64 public constant MAX_SPONSOR_LOCK_DURATION = 24 weeks;
    uint64 public constant MAX_DEPOSIT_LOCK_DURATION = 24 weeks;
    uint256 public constant SHARES_MULTIPLIER = 10**18;

    //
    // State
    //

    /// See {IVault}
    IERC20 public override(IVault) underlying;

    /// See {IVault}
    IStrategy public strategy;

    /// See {IVault}
    uint16 public override(IVault) investPerc;

    /// See {IVault}
    uint64 public immutable override(IVault) minLockPeriod;

    /// See {IVaultSponsoring}
    uint256 public override(IVaultSponsoring) totalSponsored;

    /// Depositors, represented as an NFT per deposit
    Depositors public depositors;

    /// Yield allocation
    Claimers public claimers;

    /// Unique IDs to correlate donations that belong to the same foundation
    Counters.Counter private _depositGroupIds;

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
    Counters.Counter private _depositIds;

    struct Claimer {
        uint256 totalPrincipal;
        uint256 totalShares;
    }

    mapping(uint256 => Claimer) public claimer;
    Counters.Counter private _claimerIds;

    // The total of shares
    uint256 public totalShares;

    // The total of principal deposited
    uint256 public totalPrincipal;

    // Treasury address to collect performance fee
    address public treasury;

    // Performance fee percentage
    uint16 public perfFeePct;

    // Current accumulated performance fee;
    uint256 public accumulatedPerfFee;

    /**
     * @param _underlying Underlying ERC20 token to use.
     * @param _minLockPeriod Minimum lock period to deposit
     * @param _investPerc Percentage of the total underlying to invest in the strategy
     * @param _treasury Treasury address to collect performance fee
     * @param _owner Vault admin address
     * @param _perfFeePct Performance fee percentage
     */
    constructor(
        IERC20 _underlying,
        uint64 _minLockPeriod,
        uint16 _investPerc,
        address _treasury,
        address _owner,
        uint16 _perfFeePct
    ) {
        require(
            PercentMath.validPerc(_investPerc),
            "Vault: invalid investPerc"
        );
        require(
            PercentMath.validPerc(_perfFeePct),
            "Vault: invalid performance fee"
        );
        require(
            address(_underlying) != address(0x0),
            "Vault: underlying cannot be 0x0"
        );
        require(_treasury != address(0x0), "Vault: treasury cannot be 0x0");
        require(_owner != address(0x0), "Vault: owner cannot be 0x0");
        require(
            _minLockPeriod != 0 && _minLockPeriod <= MAX_DEPOSIT_LOCK_DURATION,
            "Vault: invalid minLockPeriod"
        );

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(INVESTOR_ROLE, _owner);

        investPerc = _investPerc;
        underlying = _underlying;
        treasury = _treasury;
        minLockPeriod = _minLockPeriod;
        perfFeePct = _perfFeePct;

        depositors = new Depositors(this);
        claimers = new Claimers(this);
    }

    //
    // IVault
    //

    /// See {IVault}
    function setTreasury(address _treasury)
        external
        override(IVault)
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            address(_treasury) != address(0x0),
            "Vault: treasury cannot be 0x0"
        );
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// See {IVault}
    function setPerfFeePct(uint16 _perfFeePct)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            PercentMath.validPerc(_perfFeePct),
            "Vault: invalid performance fee"
        );
        perfFeePct = _perfFeePct;
        emit PerfFeePctUpdated(_perfFeePct);
    }

    /// See {IVault}
    function setStrategy(address _strategy)
        external
        override(IVault)
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_strategy != address(0), "Vault: strategy 0x");
        require(
            IStrategy(_strategy).vault() == address(this),
            "Vault: invalid vault"
        );
        require(
            address(strategy) == address(0) || strategy.hasAssets() == false,
            "Vault: strategy has invested funds"
        );

        console.log("Vault.sol setting strategy");

        strategy = IStrategy(_strategy);

        emit StrategyUpdated(_strategy);
    }

    /// See {IVault}
    function totalUnderlying() public view override(IVault) returns (uint256) {
        if (address(strategy) != address(0)) {
            return
                underlying.balanceOf(address(this)) + strategy.investedAssets();
        }

        return underlying.balanceOf(address(this));
    }

    /// See {IVault}
    function yieldFor(address _to)
        public
        view
        override(IVault)
        returns (
            uint256 claimableYield,
            uint256 shares,
            uint256 perfFee
        )
    {
        uint256 tokenId = claimers.tokenOf(_to);
        uint256 claimerPrincipal = claimer[tokenId].totalPrincipal;
        uint256 claimerShares = claimer[tokenId].totalShares;

        uint256 currentClaimerPrincipal = _computeAmount(
            claimerShares,
            totalShares,
            totalUnderlyingMinusSponsored()
        );

        if (currentClaimerPrincipal <= claimerPrincipal) {
            return (0, 0, 0);
        }

        uint256 yieldWithPerfFee = currentClaimerPrincipal - claimerPrincipal;

        shares = _computeShares(
            yieldWithPerfFee,
            totalShares,
            totalUnderlyingMinusSponsored()
        );
        uint256 sharesAmount = _computeAmount(
            shares,
            totalShares,
            totalUnderlyingMinusSponsored()
        );

        perfFee = sharesAmount.percOf(perfFeePct);
        claimableYield = sharesAmount - perfFee;
    }

    /// See {IVault}
    function deposit(DepositParams calldata _params)
        external
        nonReentrant
        returns (uint256[] memory depositIds)
    {
        require(_params.amount != 0, "Vault: cannot deposit 0");
        require(
            _params.lockDuration >= minLockPeriod &&
                _params.lockDuration <= MAX_DEPOSIT_LOCK_DURATION,
            "Vault: invalid lock period"
        );
        uint256 principalMinusStrategyFee = _applyInvestmentFee(totalPrincipal);
        require(
            principalMinusStrategyFee <= totalUnderlyingMinusSponsored(),
            "Vault: cannot deposit when yield is negative"
        );

        uint64 lockedUntil = _params.lockDuration + _blockTimestamp();

        depositIds = _createDeposit(
            _params.amount,
            lockedUntil,
            _params.claims
        );
        _transferAndCheckUnderlying(_msgSender(), _params.amount);
    }

    /// See {IVault}
    function claimYield(address _to) external override(IVault) nonReentrant {
        require(_to != address(0), "Vault: destination address is 0x");

        (uint256 yield, uint256 shares, uint256 fee) = yieldFor(_msgSender());

        if (yield == 0) return;

        uint256 claimerId = claimers.tokenOf(_msgSender());

        accumulatedPerfFee += fee;

        underlying.safeTransfer(_to, yield);

        claimer[claimerId].totalShares -= shares;
        totalShares -= shares;

        emit YieldClaimed(claimerId, _to, yield, shares, fee);
    }

    /// See {IVault}
    function withdraw(address _to, uint256[] calldata _ids)
        external
        override(IVault)
        nonReentrant
    {
        require(_to != address(0), "Vault: destination address is 0x");

        _withdraw(_to, _ids, false);
    }

    /// See {IVault}
    function forceWithdraw(address _to, uint256[] calldata _ids)
        external
        nonReentrant
    {
        require(_to != address(0), "Vault: destination address is 0x");

        _withdraw(_to, _ids, true);
    }

    /// See {IVault}
    function setInvestPerc(uint16 _investPerc)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            PercentMath.validPerc(_investPerc),
            "Vault: invalid investPerc"
        );

        emit InvestPercentageUpdated(_investPerc);

        investPerc = _investPerc;
    }

    /// See {IVault}
    function investableAmount() public view returns (uint256) {
        uint256 maxInvestableAssets = totalUnderlying().percOf(investPerc);

        uint256 alreadyInvested = strategy.investedAssets();

        if (alreadyInvested >= maxInvestableAssets) {
            return 0;
        }

        return maxInvestableAssets - alreadyInvested;
    }

    /// See {IVault}
    function updateInvested(bytes calldata data)
        external
        onlyRole(INVESTOR_ROLE)
    {
        require(address(strategy) != address(0), "Vault: strategy is not set");

        console.log("vault.sol before investableAmount");

        uint256 _investable = investableAmount();

        require(_investable != 0, "Vault: nothing to invest");

        console.log("vault.sol before updateInvested");

        underlying.safeTransfer(address(strategy), _investable);

        console.log("vault.sol after updateInvested");

        emit Invested(_investable);

        console.log("vault.sol after emit Invested event");

        strategy.invest(data);

        console.log("after investing in strategy");
    }

    //
    // IVaultSponsoring

    /// See {IVaultSponsoring}
    function sponsor(uint256 _amount, uint256 _lockDuration)
        external
        override(IVaultSponsoring)
        nonReentrant
    {
        require(_amount != 0, "Vault: cannot sponsor 0");

        require(
            _lockDuration >= MIN_SPONSOR_LOCK_DURATION &&
                _lockDuration <= MAX_SPONSOR_LOCK_DURATION,
            "Vault: invalid lock period"
        );

        uint256 lockedUntil = _lockDuration + block.timestamp;
        uint256 tokenId = depositors.mint(_msgSender());

        deposits[tokenId] = Deposit(_amount, 0, lockedUntil, 0);

        emit Sponsored(tokenId, _amount, _msgSender(), lockedUntil);

        totalSponsored += _amount;
        _transferAndCheckUnderlying(_msgSender(), _amount);
    }

    /// See {IVaultSponsoring}
    function unsponsor(address _to, uint256[] memory _ids)
        external
        nonReentrant
    {
        require(_to != address(0), "Vault: destination address is 0x");

        _unsponsor(_to, _ids);
    }

    function withdrawPerformanceFee() external onlyRole(INVESTOR_ROLE) {
        uint256 _perfFee = accumulatedPerfFee;
        require(_perfFee != 0, "Vault: no performance fee");

        accumulatedPerfFee = 0;

        emit FeeWithdrawn(_perfFee);
        underlying.safeTransfer(treasury, _perfFee);
    }

    //
    // Public API
    //

    /**
     * Computes the total amount of principal + yield currently controlled by the
     * vault and the strategy. The principal + yield is the total amount
     * of underlying that can be claimed or withdrawn, excluding the sponsored amount and performance fee.
     *
     * @return Total amount of principal and yield help by the vault (not including sponsored amount and performance fee).
     */
    function totalUnderlyingMinusSponsored() public view returns (uint256) {
        uint256 _totalUnderlying = totalUnderlying();
        uint256 deductAmount = totalSponsored + accumulatedPerfFee;
        if (deductAmount > _totalUnderlying) {
            return 0;
        }

        return _totalUnderlying - deductAmount;
    }

    //
    // ERC165
    //

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165, AccessControl)
        returns (bool)
    {
        return
            interfaceId == type(IVault).interfaceId ||
            interfaceId == type(IVaultSponsoring).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    //
    // Internal API
    //

    /**
     * Withdraws the principal from the deposits with the ids provided in @param _ids and sends it to @param _to.
     *
     * @notice the NFTs of the deposits will be burned.
     *
     * @param _to Address that will receive the funds.
     * @param _ids Array with the ids of the deposits.
     * @param _force Boolean to specify if the action should be perfomed when there's loss.
     */
    function _withdraw(
        address _to,
        uint256[] calldata _ids,
        bool _force
    ) internal {
        uint256 localTotalShares = totalShares;
        uint256 localTotalPrincipal = totalUnderlyingMinusSponsored();
        uint256 amount;
        uint256 idsLen = _ids.length;

        for (uint256 i; i < idsLen; ++i) {
            amount += _withdrawDeposit(
                _ids[i],
                localTotalShares,
                localTotalPrincipal,
                _to,
                _force
            );
        }

        underlying.safeTransfer(_to, amount);
    }

    /**
     * Withdraws the sponsored amount for the deposits with the ids provided
     * in @param _ids and sends it to @param _to.
     *
     * @notice the NFTs of the deposits will be burned.
     *
     * @param _to Address that will receive the funds.
     * @param _ids Array with the ids of the deposits.
     */
    function _unsponsor(address _to, uint256[] memory _ids) internal {
        uint256 sponsorAmount;
        uint256 idsLen = _ids.length;

        for (uint8 i; i < idsLen; ++i) {
            uint256 tokenId = _ids[i];

            uint256 lockedUntil = deposits[tokenId].lockedUntil;
            uint256 claimerId = deposits[tokenId].claimerId;
            address owner = depositors.ownerOf(tokenId);
            uint256 amount = deposits[tokenId].amount;

            require(owner == _msgSender(), "Vault: you are not allowed");
            require(lockedUntil <= block.timestamp, "Vault: amount is locked");
            require(claimerId == 0, "Vault: token id is not a sponsor");

            sponsorAmount += amount;

            depositors.burn(tokenId);

            emit Unsponsored(tokenId);
        }

        uint256 sponsorToTransfer = sponsorAmount;

        require(
            sponsorToTransfer <= totalUnderlying(),
            "Vault: not enough funds"
        );

        totalSponsored -= sponsorAmount;

        underlying.safeTransfer(_to, sponsorToTransfer);
    }

    /**
     * @dev `_createDeposit` declares too many locals
     * We move some of them to this struct to fix the problem
     */
    struct CreateDepositLocals {
        uint256 totalShares;
        uint256 totalUnderlying;
        uint256 groupId;
        uint16 accumulatedPct;
        uint256 accumulatedAmount;
        uint256 claimsLen;
    }

    /**
     * Creates a deposit with the given amount of underlying and claim
     * structure. The deposit is locked until the timestamp specified in @param _lockedUntil.
     * @notice This function assumes underlying will be transfered elsewhere in
     * the transaction.
     *
     * @notice Underlying must be transfered *after* this function, in order to
     * correctly calculate shares.
     *
     * @notice claims must add up to 100%.
     *
     * @param _amount Amount of underlying to consider @param claims claim
     * @param _lockedUntil Timestamp at which the deposit unlocks
     * @param claims Claim params
     * params.
     */
    function _createDeposit(
        uint256 _amount,
        uint64 _lockedUntil,
        ClaimParams[] calldata claims
    ) internal returns (uint256[] memory) {
        CreateDepositLocals memory locals = CreateDepositLocals({
            totalShares: totalShares,
            totalUnderlying: totalUnderlyingMinusSponsored(),
            groupId: _depositGroupIds.current(),
            accumulatedPct: 0,
            accumulatedAmount: 0,
            claimsLen: claims.length
        });

        uint256[] memory result = new uint256[](locals.claimsLen);

        for (uint256 i; i < locals.claimsLen; ++i) {
            ClaimParams memory data = claims[i];
            require(data.pct != 0, "Vault: claim percentage cannot be 0");
            // if it's the last claim, just grab all remaining amount, instead
            // of relying on percentrages
            uint256 localAmount = i == locals.claimsLen - 1
                ? _amount - locals.accumulatedAmount
                : _amount.percOf(data.pct);

            result[i] = _createClaim(
                locals.groupId,
                localAmount,
                _lockedUntil,
                data,
                locals.totalShares,
                locals.totalUnderlying
            );
            locals.accumulatedPct += data.pct;
            locals.accumulatedAmount += localAmount;
        }

        require(
            locals.accumulatedPct.is100Perc(),
            "Vault: claims don't add up to 100%"
        );

        _depositGroupIds.increment();

        return result;
    }

    function _createClaim(
        uint256 _depositGroupId,
        uint256 _amount,
        uint64 _lockedUntil,
        ClaimParams memory _claim,
        uint256 _localTotalShares,
        uint256 _localTotalPrincipal
    ) internal returns (uint256) {
        uint256 newShares = _computeShares(
            _amount,
            _localTotalShares,
            _localTotalPrincipal
        );

        uint256 claimerId = claimers.mint(_claim.beneficiary);

        claimer[claimerId].totalShares += newShares;
        claimer[claimerId].totalPrincipal += _amount;

        totalShares += newShares;
        totalPrincipal += _amount;

        uint256 tokenId = depositors.mint(_msgSender());

        deposits[tokenId] = Deposit(
            _amount,
            claimerId,
            _lockedUntil,
            newShares
        );

        emit DepositMinted(
            tokenId,
            _depositGroupId,
            _amount,
            newShares,
            _msgSender(),
            _claim.beneficiary,
            claimerId,
            _lockedUntil,
            _claim.data
        );

        return tokenId;
    }

    /**
     * Burns a deposit NFT and reduces the principal and shares of the claimer.
     * If there were any yield to be claimed, the claimer will also keep shares to withdraw later on.
     *
     * @notice This function doesn't transfer any funds, it only updates the state.
     *
     * @notice Only the owner of the deposit may call this function.
     *
     * @param _tokenId The deposit ID to withdraw from.
     * @param _totalShares The total shares to consider for the withdraw.
     * @param _totalUnderlyingMinusSponsored The total underlying to consider for the withdraw.
     * @param _to Where the funds will be sent
     * @param _force If the withdraw should still withdraw if there are not enough funds in the vault.
     *
     * @return the amount to withdraw.
     */
    function _withdrawDeposit(
        uint256 _tokenId,
        uint256 _totalShares,
        uint256 _totalUnderlyingMinusSponsored,
        address _to,
        bool _force
    ) internal returns (uint256) {
        require(
            depositors.ownerOf(_tokenId) == _msgSender(),
            "Vault: you are not the owner of a deposit"
        );

        require(
            deposits[_tokenId].lockedUntil <= block.timestamp,
            "Vault: deposit is locked"
        );

        require(
            deposits[_tokenId].claimerId != 0,
            "Vault: token id is not a deposit"
        );

        uint256 claimerId = deposits[_tokenId].claimerId;
        uint256 depositInitialShares = deposits[_tokenId].shares;
        uint256 depositAmount = deposits[_tokenId].amount;

        uint256 claimerShares = claimer[claimerId].totalShares;
        uint256 claimerPrincipal = claimer[claimerId].totalPrincipal;

        uint256 depositShares = _computeShares(
            depositAmount,
            _totalShares,
            _totalUnderlyingMinusSponsored
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

        depositors.burn(_tokenId);

        emit DepositBurned(_tokenId, depositShares, _to);

        return
            _computeAmount(
                depositShares,
                _totalShares,
                _totalUnderlyingMinusSponsored
            );
    }

    function _transferAndCheckUnderlying(address _from, uint256 _amount)
        internal
    {
        uint256 balanceBefore = underlying.balanceOf(address(this));
        underlying.safeTransferFrom(_from, address(this), _amount);
        uint256 balanceAfter = underlying.balanceOf(address(this));

        require(
            balanceAfter == balanceBefore + _amount,
            "Vault: amount received does not match params"
        );
    }

    function _blockTimestamp() internal view returns (uint64) {
        return uint64(block.timestamp);
    }

    /**
     * Computes amount of shares that will be received for a given deposit amount
     *
     * @param _amount Amount of deposit to consider.
     * @param _totalShares Amount of existing shares to consider.
     * @param _totalUnderlyingMinusSponsored Amount of existing underlying to consider.
     * @return Amount of shares the deposit will receive.
     */
    function _computeShares(
        uint256 _amount,
        uint256 _totalShares,
        uint256 _totalUnderlyingMinusSponsored
    ) internal pure returns (uint256) {
        if (_amount == 0) return 0;
        if (_totalShares == 0) return _amount * SHARES_MULTIPLIER;

        require(
            _totalUnderlyingMinusSponsored != 0,
            "Vault: cannot compute shares when there's no principal"
        );

        return (_amount * _totalShares) / _totalUnderlyingMinusSponsored;
    }

    /**
     * Computes the amount of underlying from a given number of shares
     *
     * @param _shares Number of shares.
     * @param _totalShares Amount of existing shares to consider.
     * @param _totalUnderlyingMinusSponsored Amounf of existing underlying to consider.
     * @return Amount that corresponds to the number of shares.
     */
    function _computeAmount(
        uint256 _shares,
        uint256 _totalShares,
        uint256 _totalUnderlyingMinusSponsored
    ) internal pure returns (uint256) {
        if (
            _shares == 0 ||
            _totalShares == 0 ||
            _totalUnderlyingMinusSponsored == 0
        ) {
            return 0;
        }

        return ((_totalUnderlyingMinusSponsored * _shares) / _totalShares);
    }

    /**
     * Applies an estimated fee to the given @param _amount.
     *
     * This function should be used to estimate how much underlying will be
     * left after the strategy invests. For instance, the fees taken by Anchor
     * and Curve.
     *
     * @notice Returns @param _amount when a strategy is not set.
     *
     * @param _amount Amount to apply the fees to.
     *
     * @return Amount with the fees applied.
     */
    function _applyInvestmentFee(uint256 _amount)
        internal
        view
        returns (uint256)
    {
        if (address(strategy) == address(0)) return _amount;

        return strategy.applyInvestmentFee(_amount);
    }

    function sharesOf(uint256 claimerId) external view returns (uint256) {
        return claimer[claimerId].totalShares;
    }

    function principalOf(uint256 claimerId) external view returns (uint256) {
        return claimer[claimerId].totalPrincipal;
    }
}
