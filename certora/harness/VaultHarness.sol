// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Vault} from '../../contracts/Vault.sol';
import {ICurve} from "../../contracts/interfaces/curve/ICurve.sol";
import {PercentMath} from "../../contracts/lib/PercentMath.sol";

contract VaultHarness is Vault {
    using PercentMath for uint256;
    using PercentMath for uint16;

    constructor(
        IERC20Metadata _underlying,
        uint64 _minLockPeriod,
        uint16 _investPct,
        address _treasury,
        address _admin,
        uint16 _perfFeePct,
        uint16 _lossTolerancePct,
        SwapPoolParam[] memory _swapPools
    ) Vault(
        _underlying, 
        _minLockPeriod, 
        _investPct, 
        _treasury, 
        _admin, 
        _perfFeePct, 
        _lossTolerancePct, 
        _swapPools
    ) {}

    // helper function which will be used in some rules
    function getCurvePool(address _token) public view returns (ICurve) {
        return swappers[_token].pool;
    }

    function deposit(
        address inputToken, 
        uint64 lockDuration, 
        uint256 amount, 
        uint16[] calldata pcts,
        address[] calldata beneficiaries,
        bytes[] calldata datas,
        uint256 slippage
    ) external nonReentrant whenNotPaused {
        DepositParams memory params = buildDepositParams(
            inputToken,
            lockDuration,
            amount,
            pcts,
            beneficiaries,
            datas,
            slippage
        );
        this.deposit(params);
    }

    function depositForGroupId(
        uint256 groupId,
        address inputToken, 
        uint64 lockDuration, 
        uint256 amount, 
        uint16[] calldata pcts,
        address[] calldata beneficiaries,
        bytes[] calldata datas,
        uint256 slippage
    ) external nonReentrant whenNotPaused {
        DepositParams memory params = buildDepositParams(
            inputToken,
            lockDuration,
            amount,
            pcts,
            beneficiaries,
            datas,
            slippage
        );
        this.depositForGroupId(groupId, params);
    }

    function is100Pct(uint16[] calldata pcts) external pure returns (bool) {
        uint16 accumulatedPct = 0;
        for(uint256 i = 0; i < pcts.length; i++) {
            accumulatedPct += pcts[i];
        }
        return accumulatedPct.is100Pct();
    }

    function addPool(address token, address pool, int128 tokenI, int128 underlyingI) external onlyAdmin {
        SwapPoolParam memory param = SwapPoolParam({
            token: token,
            pool: pool,
            tokenI: tokenI,
            underlyingI: underlyingI
        });
        this.addPool(param);
    }

    function maxInvestableAmount() external view returns (uint256) {
        uint256 maxInvestableAmount;
        (maxInvestableAmount, ) = investState();
        return maxInvestableAmount;
    }

    function alreadyInvested() external view returns (uint256) {
        uint256 alreadyInvested;
        (, alreadyInvested) = investState();
        return alreadyInvested;
    }

    function claimableYield(address claimer) external view returns (uint256) {
        uint256 claimableYield;
        (claimableYield, ,) = yieldFor(claimer);
        return claimableYield;
    }

    function claimableShares(address claimer) external view returns (uint256) {
        uint256 claimableShares;
        (, claimableShares,) = yieldFor(claimer);
        return claimableShares;
    }

    function perfFee(address claimer) external view returns (uint256) {
        uint256 perfFee;
        (, , perfFee) = yieldFor(claimer);
        return perfFee;
    }

    function depositGroupOwner(uint256 groupId) external view returns (address) {
        return depositGroupIdOwner[groupId];
    }

    function depositAmount(uint256 id) external view returns(uint256) {
        return deposits[id].amount;
    }

    function depositOwner(uint256 id) external view returns(address) {
        return deposits[id].owner;
    }

    function depositClaimer(uint256 id) external view returns(address) {
        return deposits[id].claimerId;
    }

    function depositLockedUntil(uint256 id) external view returns(uint256) {
        return deposits[id].lockedUntil;
    }

    function buildDepositParams(
        address inputToken, 
        uint64 lockDuration, 
        uint256 amount, 
        uint16[] calldata pcts,
        address[] calldata beneficiaries,
        bytes[] calldata datas,
        uint256 slippage
    ) internal returns (DepositParams memory) {
        require(pcts.length == beneficiaries.length && pcts.length == datas.length);
        ClaimParams[] memory claims;
        for(uint256 i = 0; i < pcts.length; i++) {
            claims[i] = ClaimParams({
                pct: pcts[i],
                beneficiary: beneficiaries[i],
                data: datas[i]
            });
        }
        return DepositParams({
            inputToken: inputToken,
            lockDuration: lockDuration,
            amount: amount,
            claims: claims,
            name: "test",
            slippage: slippage
        });
    }

    function principalOf(uint256 depositId) external view returns (uint256) {
        return claimer[deposits[depositId].claimerId].totalPrincipal;
    }

    function totalSharesOf(address[] calldata claimers) external view returns (uint256) {
        uint256 total = 0;
        for(uint256 i = 0; i < claimers.length; i++) {
            address claimerId = claimers[i];
            if (claimerId != address(0x0)) {
                total += claimer[claimerId].totalShares;
            }
        }
        return total;
    }

    function totalDeposits(uint256[] calldata depositIds) external view returns (uint256) {
        uint256 total = 0;
        for(uint256 i = 0; i < depositIds.length; i++) {
            total += deposits[depositIds[i]].amount;
        }
        return total;
    }

    function totalPrincipalOf(address[] calldata claimers) external view returns (uint256) {
        uint256 total = 0;
        for(uint256 i = 0; i < claimers.length; i++) {
            address claimerId = claimers[i];
            if (claimerId != address(0x0)) {
                total += claimer[claimerId].totalPrincipal;
            }
        }
        return total;
    }

    function totalSharesOf(uint256[] calldata depositIds) external view returns (uint256) {
        uint256 total = 0;
        for(uint256 i = 0; i < depositIds.length; i++) {
            address claimerId = deposits[depositIds[i]].claimerId;
            if (claimerId != address(0x0)) {
                total += claimer[claimerId].totalShares;
            }
        }
        return total;
    }

    function totalPrincipalOf(uint256[] calldata depositIds) external view returns (uint256) {
        uint256 total = 0;
        for(uint256 i = 0; i < depositIds.length; i++) {
            address claimerId = deposits[depositIds[i]].claimerId;
            if (claimerId != address(0x0)) {
                total += claimer[claimerId].totalPrincipal;
            }
        }
        return total;
    }

    function totalAmount(uint256[] calldata amounts) external pure returns (uint256) {
        uint256 total = 0;
        for(uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        return total;
    }

    function anyZero(uint16[] calldata numbers) external pure returns (bool) {
        for(uint256 i = 0; i < numbers.length; i++) {
            if (numbers[i] == 0) {
                return true;
            }
        }
        return false;
    }

    function isTotal100Pct(uint16[] calldata pcts) external pure returns (bool) {
        uint16 total = 0;
        for(uint256 i = 0; i < pcts.length; i++) {
            total += pcts[i];
        }
        return total == 10000; 
    }

    function anyZero(address[] calldata addresses) external pure returns (bool) {
        for(uint256 i = 0; i < addresses.length; i++) {
            if (addresses[i] == address(0x0)) {
                return true;
            }
        }
        return false;
    }
}