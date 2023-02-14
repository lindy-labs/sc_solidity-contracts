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
import {IOracle} from "../../interfaces/opyn/IOracle.sol";
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
    error StrategyCollateralCapReached();
    error StrategyInvalidTwapPeriod();
    error StrategyInvalidSlippagePct();

    uint32 public constant MAX_TWAP_PERIOD = 1 days;

    uint32 public twapPeriod = 300 seconds;

    IWETH public weth;
    IERC20 public oSqth;
    ICrabStrategyV2 public crabStrategyV2;
    ICrabNetting public crabNetting;
    ISwapRouter public swapRouter;
    IOracle public oracle;
    IUniswapV3Pool public usdcWethPool;
    IUniswapV3Pool public wethOSqthPool;

    uint16 public ethToUsdcMaxSlippagePct = 50; // 0.5%
    uint16 public ethToOsqthMaxSlippagePct = 100; // 1%

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
        _grantRole(SETTINGS_ROLE, _admin);

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
            _getUsdcBalance() != 0 ||
            _getCrabBalance() != 0 ||
            crabNetting.usdBalance(address(this)) != 0 ||
            crabNetting.crabBalance(address(this)) != 0;
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
        uint256 crabBalance = _getCrabBalance();
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

        // withdraw immediately from usdc balance
        if (usdcBalance != 0 && _amount <= usdcBalance) {
            _transferUsdcToVault(_amount);
            return _amount;
        }

        amountRemaining = _amount - usdcBalance;

        uint256 queuedDeposit = crabNetting.usdBalance(address(this));

        if (queuedDeposit != 0) {
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
        uint256 ethToDeposit = ethAmount + _ethAmountToBorrow;

        _checkCrabStrategyCollateralCap(ethToDeposit);

        crabStrategyV2.flashDeposit{value: ethAmount}(
            ethToDeposit,
            wethOSqthPool.fee()
        );

        // note: it's ok to use 0 as min amount out because we are swapping leftovers
        _swapEthForUSDC(_getEthBalance(), 0);
    }

    function flashWithdraw(
        uint256 _crabAmount,
        uint256 _maxEthToPayForDebt,
        uint256 _usdcAmountOutMin // amount of usdc to receive from eth -> usdc swap
    ) external onlyKeeper {
        if (_crabAmount == 0) revert StrategyAmountZero();

        uint256 crabBalance = _getCrabBalance();
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

        uint256 crabBalance = _getCrabBalance();

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

    function calcMaxEthToPaySqueethDebt(
        uint256 _squeethDebt
    ) public view returns (uint256) {
        uint256 squeethPriceInWeth = getTwapFromOracle(
            address(wethOSqthPool),
            oSqth,
            weth
        );

        // when paying off the squeeth debt, we need to account for the slipage
        // exact amount of squeeth is taken from the pool in the flash swap and payed off with eth collateral taken out from the strategy
        // since sqeeth is the output token, slippage affects the eth amount we put in
        return
            ((_squeethDebt * squeethPriceInWeth) / 1e18).pctOf(
                10000 + ethToOsqthMaxSlippagePct
            );
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
                twapPeriod,
                true // check period
            );
    }

    function setEthToUsdcMaxSlippagePct(
        uint16 _maxSlippagePct
    ) external onlySettings {
        if (_maxSlippagePct > 10000 || _maxSlippagePct == 0)
            revert StrategyInvalidSlippagePct();

        ethToUsdcMaxSlippagePct = _maxSlippagePct;
    }

    function setEthToOsqthMaxSlippagePct(
        uint16 _maxSlippagePct
    ) external onlySettings {
        if (_maxSlippagePct > 10000 || _maxSlippagePct == 0)
            revert StrategyInvalidSlippagePct();

        ethToOsqthMaxSlippagePct = _maxSlippagePct;
    }

    function setTwapPeriod(uint32 _period) external onlySettings {
        if (_period == 0 || _period > MAX_TWAP_PERIOD)
            revert StrategyInvalidTwapPeriod();

        twapPeriod = _period;
    }

    receive() external payable {}

    /// Internal functions

    function _is0Address(address _address) internal pure returns (bool) {
        return _address == address(0);
    }

    function _getUsdcBalance() internal view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    function _getCrabBalance() internal view returns (uint256) {
        return crabStrategyV2.balanceOf(address(this));
    }

    function _getEthBalance() internal view returns (uint256) {
        return address(this).balance;
    }

    function _transferUsdcToVault(uint256 _amount) internal {
        underlying.transfer(vault, _amount);
        emit StrategyWithdrawn(_amount);
    }

    function _withdrawFromCrab(uint256 _usdcAmount) internal returns (uint256) {
        uint256 crabToWithdraw = _getCrabToWithdraw(_usdcAmount);
        uint256 maxEthToPayDebt = calcMaxEthToPaySqueethDebt(
            crabStrategyV2.getWsqueethFromCrabAmount(crabToWithdraw)
        );

        crabStrategyV2.flashWithdraw(
            crabToWithdraw,
            maxEthToPayDebt,
            wethOSqthPool.fee()
        );

        uint256 ethBalance = _getEthBalance();

        return
            _swapEthForUSDC(ethBalance, _calculateUsdcMinAmountOut(ethBalance));
    }

    function _calculateUsdcMinAmountOut(
        uint256 _ethAmountIn
    ) internal view returns (uint256) {
        uint256 ethPriceInUsd = getTwapFromOracle(
            address(usdcWethPool),
            weth,
            underlying
        );

        // account for 12 decimals difference between usdc and crab
        return
            ((_ethAmountIn * ethPriceInUsd) / 1e18 / 1e12).pctOf(
                10000 - ethToUsdcMaxSlippagePct
            );
    }

    function _getCrabToWithdraw(
        uint256 _usdcAmount
    ) internal returns (uint256) {
        // account for 12 decimals difference between usdc and crab
        uint256 crabNeeded = (_usdcAmount * 1e18 * 1e12) / getCrabFairPrice();
        uint256 crabBalance = _getCrabBalance();

        if (crabNeeded <= crabBalance) return crabNeeded;

        uint256 crabQueued = crabNetting.crabBalance(address(this));
        uint256 crabToDequeue = crabNeeded - crabBalance;

        // round down to avoid reverts
        if (crabToDequeue > crabQueued) crabToDequeue = crabQueued;

        crabNetting.dequeueCrab(crabToDequeue, true);

        return crabBalance + crabToDequeue;
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

    function _checkCrabStrategyCollateralCap(uint256 _ethAmount) internal view {
        (, , uint256 collateral, ) = crabStrategyV2.getVaultDetails();

        if (collateral + _ethAmount > crabStrategyV2.strategyCap())
            revert StrategyCollateralCapReached();
    }
}
