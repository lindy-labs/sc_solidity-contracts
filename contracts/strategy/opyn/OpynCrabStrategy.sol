// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

import {PercentMath} from "../../lib/PercentMath.sol";
import {IStrategy} from "../IStrategy.sol";
import {BaseStrategy} from "../BaseStrategy.sol";
import {IVault} from "../../vault/IVault.sol";
import {ERC165Query} from "../../lib/ERC165Query.sol";
import {ICurveExchange} from "../../interfaces/curve/ICurveExchange.sol";
import {IOracle} from "../../interfaces/uniswap/IOracle.sol";
import {ICrabStrategyV2} from "../../interfaces/opyn/ICrabStrategyV2.sol";
import {ICrabNetting} from "../../interfaces/opyn/ICrabNetting.sol";
import {IWETH} from "../../interfaces/IWETH.sol";

contract OpynCrabStrategy is BaseStrategy {
    using PercentMath for uint256;
    using ERC165Query for address;

    error StrategyWethCannotBe0Address();
    error StrategySqueethCannotBe0Address();
    error StrategyCrabStrategyCannotBe0Address();
    error StrategyCrabNettingCannotBe0Address();
    error StrategySwapRouterCannotBe0Address();
    error StrategyOracleCannotBe0Address();
    error StrategyUsdcWethPoolCannotBe0Address();
    error StrategyWethOSqthPoolCannotBe0Address();
    error StrategyAmountTooHigh();

    uint32 public constant TWAP_PERIOD = 420 seconds; // TODO: make configurable

    IWETH public weth;
    IERC20 public oSqth;
    ICrabStrategyV2 public crabStrategyV2;
    ICrabNetting public crabNetting;
    ISwapRouter public swapRouter;
    IOracle public oracle;
    IUniswapV3Pool public usdcWethPool;
    IUniswapV3Pool public wethOSqthPool;

    constructor(
        address _vault,
        address _admin,
        address _keeper,
        IERC20 _underlying, // USDC,
        IWETH _weth,
        IERC20 _oSqth,
        ICrabStrategyV2 _crabStrategy,
        ICrabNetting _crabNetting,
        ISwapRouter _swapRouter,
        IOracle _oracle,
        IUniswapV3Pool _usdcWethPool,
        IUniswapV3Pool _wethOSqthPool
    ) BaseStrategy(_vault, _underlying, _admin) {
        if (_is0Address(_keeper)) revert StrategyKeeperCannotBe0Address();
        if (_is0Address(address(_weth))) revert StrategyWethCannotBe0Address();
        if (_is0Address(address(_oSqth)))
            revert StrategySqueethCannotBe0Address();
        if (_is0Address(address(_crabStrategy)))
            revert StrategyCrabStrategyCannotBe0Address();
        if (_is0Address(address(_crabNetting)))
            revert StrategyCrabNettingCannotBe0Address();
        if (_is0Address(address(_swapRouter)))
            revert StrategySwapRouterCannotBe0Address();
        if (_is0Address(address(_oracle)))
            revert StrategyOracleCannotBe0Address();
        if (_is0Address(address(_usdcWethPool)))
            revert StrategyUsdcWethPoolCannotBe0Address();
        if (_is0Address(address(_wethOSqthPool)))
            revert StrategyWethOSqthPoolCannotBe0Address();

        _grantRole(KEEPER_ROLE, _keeper);

        weth = _weth;
        oSqth = _oSqth;
        crabStrategyV2 = _crabStrategy;
        crabNetting = _crabNetting;
        swapRouter = _swapRouter;
        oracle = _oracle;
        usdcWethPool = _usdcWethPool;
        wethOSqthPool = _wethOSqthPool;
    }

    //
    // IStrategy
    //

    /// @inheritdoc IStrategy
    function isSync() external pure override(IStrategy) returns (bool) {
        return true;
    }

    /// @inheritdoc IStrategy
    function hasAssets()
        external
        view
        virtual
        override(IStrategy)
        returns (bool)
    {
        return
            _getUsdcBalance() > 0 ||
            crabStrategyV2.balanceOf(address(this)) > 0 ||
            crabNetting.usdBalance(address(this)) > 0 ||
            crabNetting.crabBalance(address(this)) > 0;
    }

    /// @inheritdoc IStrategy
    function investedAssets()
        public
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        uint256 usdcBalance = _getUsdcBalance();
        uint256 crabBalance = crabStrategyV2.balanceOf(address(this));
        uint256 usdcQueued = crabNetting.usdBalance(address(this));
        uint256 crabQueued = crabNetting.crabBalance(address(this));

        if (crabBalance == 0 && crabQueued == 0)
            return usdcBalance + usdcQueued;

        uint256 amountInCrab = ((crabBalance + crabQueued) *
            getCrabFairPrice()) /
            1e18 /
            1e12; // account for 6 decimals of USDC

        return usdcBalance + usdcQueued + amountInCrab;
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        emit StrategyInvested(_getUsdcBalance());
    }

    /// @inheritdoc IStrategy
    function withdrawToVault(
        uint256 _amount
    ) external virtual override(IStrategy) onlyManager returns (uint256) {
        if (_amount == 0) revert StrategyAmountZero();
        if (_amount > investedAssets()) revert StrategyNotEnoughShares();

        uint256 usdcBalance = _getUsdcBalance();
        uint256 amountRemaining = _amount;

        if (usdcBalance > 0) {
            if (_amount <= usdcBalance) {
                // withdraw immediately from usdc balance
                _transferUsdcToVault(_amount);
                return _amount;
            }

            amountRemaining = _amount - usdcBalance;
        }

        uint256 queuedDeposit = crabNetting.usdBalance(address(this));

        if (queuedDeposit > 0) {
            if (amountRemaining <= queuedDeposit) {
                // withdraw immediately from queued deposit
                crabNetting.withdrawUSDC(amountRemaining, true);
                _transferUsdcToVault(_amount);
                return _amount;
            }

            // withdraw what is possible from queued deposit
            crabNetting.withdrawUSDC(queuedDeposit, true);
            amountRemaining -= queuedDeposit;
        }

        uint256 amountFromCrab = _withdrawFromCrab(amountRemaining);
        uint256 endAmountToWithdraw = _amount -
            amountRemaining +
            amountFromCrab;

        _transferUsdcToVault(endAmountToWithdraw);

        return endAmountToWithdraw;
    }

    /// @inheritdoc IStrategy
    function transferYield(
        address, // _to
        uint256 // _amount
    ) external virtual override(BaseStrategy) onlyManager returns (uint256) {
        return 0;
    }

    //
    // External API
    //

    // @param _ethAmount amount of eth to send as msg.value in falshDeposit call
    // @param _ethAmountToBorrow amount of eth that will be borrowed in uni v3 flash swap
    function flashDeposit(
        uint256 _usdcAmount,
        uint256 _ethAmountOutMin, // amount of eth to receive from usdc -> eth swap
        uint256 _ethAmountToBorrow
    ) external onlyKeeper {
        uint256 ethAmount = _swapUsdcForEth(_usdcAmount, _ethAmountOutMin);
        // TODO: check the crab strategy collateral cap

        crabStrategyV2.flashDeposit{value: ethAmount}(
            ethAmount + _ethAmountToBorrow,
            wethOSqthPool.fee()
        );

        // note: it's ok to use 0 as min amount out because we are swapping leftovers
        _swapEthForUSDC(_getEthBalance(), 0);
        // TODO: emit event
    }

    function flashWithdraw(
        uint256 _crabAmount,
        uint256 _maxEthToPayForDebt,
        uint256 _usdcAmountOutMin
    ) external onlyKeeper {
        if (_crabAmount == 0) revert StrategyAmountZero();

        uint256 crabBalance = crabStrategyV2.balanceOf(address(this));
        if (crabBalance == 0 || crabBalance < _crabAmount)
            revert StrategyNotEnoughShares();

        crabStrategyV2.flashWithdraw(
            _crabAmount,
            _maxEthToPayForDebt,
            wethOSqthPool.fee()
        );

        _swapEthForUSDC(_getEthBalance(), _usdcAmountOutMin);
    }

    function queueUSDC(uint256 _amount) external onlyKeeper {
        if (_amount == 0) revert StrategyAmountZero();

        uint256 usdcBalance = _getUsdcBalance();

        if (_amount > usdcBalance) revert StrategyAmountTooHigh();

        underlying.approve(address(crabNetting), _amount);
        crabNetting.depositUSDC(_amount);
    }

    function dequeueUSDC(uint256 _amount) public onlyKeeper {
        if (_amount == 0) revert StrategyAmountZero();

        uint256 queuedAmount = crabNetting.usdBalance(address(this));

        if (queuedAmount < _amount) revert StrategyAmountTooHigh();

        crabNetting.withdrawUSDC(_amount, true);
    }

    function queueCrab(uint256 _amount) external onlyKeeper {
        if (_amount == 0) revert StrategyAmountZero();

        uint256 crabBalance = crabStrategyV2.balanceOf(address(this));

        if (_amount > crabBalance) revert StrategyAmountTooHigh();

        crabStrategyV2.approve(address(crabNetting), _amount);
        crabNetting.queueCrabForWithdrawal(_amount);
    }

    function dequeueCrab(uint256 _amount) external onlyKeeper {
        if (_amount == 0) revert StrategyAmountZero();

        uint256 queuedAmount = crabNetting.crabBalance(address(this));

        if (queuedAmount < _amount) revert StrategyAmountTooHigh();

        crabNetting.dequeueCrab(_amount, true);
    }

    function getCrabFairPrice() public view returns (uint256) {
        uint256 squeethPriceInEth = getTwapFromOracle(
            address(wethOSqthPool),
            oSqth,
            weth
        );
        uint256 ethPriceInUsd = getTwapFromOracle(
            address(usdcWethPool),
            weth,
            underlying
        );
        (, , uint256 collateral, uint256 squeethDebt) = crabStrategyV2
            .getVaultDetails();

        // to determine the fair price of 1 crab in usdc, we need to consider two things:
        // 1. the amount of eth collateral that is being released for paying off
        //    the "squeeth debt" (short position) that corresponds to one crab (share)
        // 2. the value of the released eth collateral in usdc
        uint256 crabFairPrice = ((collateral -
            ((squeethDebt * squeethPriceInEth) / 1e18)) * ethPriceInUsd) /
            crabStrategyV2.totalSupply();

        return crabFairPrice;
    }

    function getTwapFromOracle(
        address _pool,
        IERC20 _base,
        IERC20 _quote
    ) public view returns (uint256) {
        return
            oracle.getTwap(
                _pool,
                address(_base),
                address(_quote),
                TWAP_PERIOD,
                true // check period
            );
    }

    receive() external payable {}

    /// Internal functions

    function _is0Address(address _address) internal pure returns (bool) {
        return _address == address(0);
    }

    function _getUsdcBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    function _getEthBalance() internal view returns (uint256) {
        return address(this).balance;
    }

    function _transferUsdcToVault(uint256 _amount) internal {
        underlying.transfer(vault, _amount);
        emit StrategyWithdrawn(_amount);
    }

    function _withdrawFromCrab(uint256 _amount) internal returns (uint256) {
        // withdraw remaining amount from the crab strategy
        uint256 crabBalance = crabStrategyV2.balanceOf(address(this));
        uint256 crabToWithdraw = (_amount * 1e18 * 1e12) / getCrabFairPrice(); // account for 12 decimals difference

        // round down to avoid reverts
        if (crabToWithdraw > crabBalance) crabToWithdraw = crabBalance;

        uint256 squeethPriceInWeth = getTwapFromOracle(
            address(wethOSqthPool),
            oSqth,
            weth
        );

        uint256 debtCostInEth = (crabStrategyV2.getWsqueethFromCrabAmount(
            crabToWithdraw
        ) * squeethPriceInWeth) / 1e18;

        // max amount of eth to used to repay short squeeth position which has to be done to release collateral in the crab strategy.
        // this has to be grater than debt cost in eth to account for fees and slippage when swapping eth for squeeth
        uint256 maxEthToPayDebt = debtCostInEth.pctOf(10100); // 1% more to cover pool fees & slippage

        crabStrategyV2.flashWithdraw(
            crabToWithdraw,
            maxEthToPayDebt,
            wethOSqthPool.fee()
        );

        return _swapEthForUSDC(_getEthBalance(), _amount.pctOf(9900));
    }

    function _swapEthForUSDC(
        uint256 _ethAmount,
        uint256 _usdcAmountOutMin
    ) internal returns (uint256) {
        if (_ethAmount == 0) return 0;

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: address(weth),
                tokenOut: address(underlying),
                fee: usdcWethPool.fee(),
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _ethAmount,
                amountOutMinimum: _usdcAmountOutMin,
                sqrtPriceLimitX96: 0
            });

        weth.deposit{value: _ethAmount}();
        weth.approve(address(swapRouter), _ethAmount);

        return swapRouter.exactInputSingle(params);
    }

    function _swapUsdcForEth(
        uint256 _usdcAmount,
        uint256 _ethAmountOutMin
    ) internal returns (uint256) {
        if (_usdcAmount == 0) revert StrategyAmountZero();

        uint256 usdcBalance = _getUsdcBalance();
        if (usdcBalance == 0) revert StrategyNoUnderlying();
        if (_usdcAmount > usdcBalance) revert StrategyAmountTooHigh();

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: address(underlying),
                tokenOut: address(weth),
                fee: usdcWethPool.fee(),
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _usdcAmount,
                amountOutMinimum: _ethAmountOutMin,
                sqrtPriceLimitX96: 0
            });

        underlying.approve(address(swapRouter), params.amountIn);

        uint256 amountOut = swapRouter.exactInputSingle(params);

        weth.withdraw(amountOut);

        return amountOut;
    }
}
