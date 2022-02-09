// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {Trust} from "@rari-capital/solmate/src/auth/Trust.sol";

import {IUniswapV3SwapRouter} from "../../lib/uniswap-v3/IUniswapV3SwapRouter.sol";
import {IVault} from "../../vault/IVault.sol";
import {IDCA} from "./IDCA.sol";
import {DCAQueue} from "./DCAQueue.sol";
import {DCAScheduler} from "./DCAScheduler.sol";

import "hardhat/console.sol";

/**
 * DCA contract targeting a Uniswap pool
 *
 * @dev This currently uses Uniswap's Router. Ideally, we should directly call
 * the necessary pairs instead, to save on gas
 */
contract DCAUniswapV3 is IDCA, DCAQueue, DCAScheduler, Trust {
    using EnumerableSet for EnumerableSet.AddressSet;

    //
    // Constants
    //

    // Uniswap Router 02
    IUniswapV3SwapRouter public constant router =
        IUniswapV3SwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    /// Since we need to avoid decimals, minRate requirements on swap functions need to be multiplied by this before being sent.
    /// This allows the final minAmountOut to be calculated before losing precision
    uint256 public constant RATES_MULTIPLIER = 1e18;

    //
    // State
    //

    address public input;
    address public output;
    bytes public path;

    /**
     * @param _vault the vault to claim from
     * @param _output the token to buy
     * @param _path the uniswap trading path
     * @param _period The minimum period between each purchase
     */
    constructor(
        address _vault,
        address _output,
        bytes memory _path,
        uint256 _period,
        address _trusted
    ) DCAScheduler(_period) DCAQueue(_vault) Trust(_trusted) {
        path = _path;
        input = address(IVault(_vault).underlying());
        output = _output;

        IERC20(input).approve(address(router), MAX_INT);
    }

    //
    // IDCA
    //

    /// See {IDCA}
    function executeSwap(uint256 _minRate, uint256 _deadline)
        external
        override(IDCA)
        onlyAfterPeriod
        requiresTrust
    {
        // TODO check output balance before and after
        // TODO keep track of various exchange rates

        _claimFromVault();
        _swap(_minRate, _deadline);
    }

    //
    // Internal API
    //

    /**
     * Performs the main swap
     */
    function _swap(uint256 _minRate, uint256 _deadline) internal {
        uint256 purchaseIndex = purchases.length;
        uint256 amountIn = IERC20(input).balanceOf(address(this));
        uint256 amountOutMin = ((amountIn * _minRate) / RATES_MULTIPLIER);

        uint256 balanceBefore = IERC20(output).balanceOf(address(this));
        router.exactInput(
            IUniswapV3SwapRouter.ExactInputParams({
                path: path,
                recipient: address(this),
                deadline: _deadline,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin
            })
        );
        uint256 balanceAfter = IERC20(output).balanceOf(address(this));
        uint256 amountOut = balanceAfter - balanceBefore;

        purchases.push(Purchase(amountOut, totalShares));

        emit SwapExecuted(purchaseIndex, amountIn, amountOut);
    }
}
