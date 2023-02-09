// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {IQuoter} from "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";

import {PercentMath} from "../../lib/PercentMath.sol";
import {IStrategy} from "../IStrategy.sol";
import {BaseStrategy} from "../BaseStrategy.sol";
import {IVault} from "../../vault/IVault.sol";
import {ERC165Query} from "../../lib/ERC165Query.sol";
import {ICurveExchange} from "../../interfaces/curve/ICurveExchange.sol";
import {IOracle} from "../../interfaces/uniswap/IOracle.sol";
import {ICrabStrategyV2, ICrabNetting, IWETH} from "../../interfaces/opyn/ICrabStrategyV2.sol";

import "hardhat/console.sol";

contract OpynCrabStrategy is BaseStrategy {
    using PercentMath for uint256;
    using ERC165Query for address;
    using SafeERC20 for IERC20;

    error StrategyWethCannotBe0Address();
    error StrategySqueethCannotBe0Address();
    error StrategyCrabStrategyCannotBe0Address();
    error StrategyCrabNettingCannotBe0Address();
    error StrategySwapRouterCannotBe0Address();
    error StrategyOracleCannotBe0Address();
    error StrategyUsdcWethPoolCannotBe0Address();
    error StrategyWethOSqthPoolCannotBe0Address();
    error StrategyAmountTooHigh();
    error StrategyEthAmountTooHigh();

    /**
     * Emmited when #invest is called by the vault.
     *
     * @param newBalance The new USDC balance of the strategy.
     */
    event StrategyDeposited(uint256 newBalance);

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
        if (is0Address(_keeper)) revert StrategyKeeperCannotBe0Address();
        if (is0Address(address(_weth))) revert StrategyWethCannotBe0Address();
        if (is0Address(address(_oSqth)))
            revert StrategySqueethCannotBe0Address();
        if (is0Address(address(_crabStrategy)))
            revert StrategyCrabStrategyCannotBe0Address();
        if (is0Address(address(_crabNetting)))
            revert StrategyCrabNettingCannotBe0Address();
        if (is0Address(address(_swapRouter)))
            revert StrategySwapRouterCannotBe0Address();
        if (is0Address(address(_oracle)))
            revert StrategyOracleCannotBe0Address();
        if (is0Address(address(_usdcWethPool)))
            revert StrategyUsdcWethPoolCannotBe0Address();
        if (is0Address(address(_wethOSqthPool)))
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

    function is0Address(address _address) internal pure returns (bool) {
        return _address == address(0);
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
            getUsdcBalance() > 0 ||
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
        uint256 usdcBalance = getUsdcBalance();
        uint256 crabBalance = crabStrategyV2.balanceOf(address(this));
        uint256 usdcPendingDeposit = crabNetting.usdBalance(address(this));
        uint256 crabPendingWithdraw = crabNetting.crabBalance(address(this));

        if (crabBalance == 0 && crabPendingWithdraw == 0)
            return usdcBalance + usdcPendingDeposit;

        uint256 amountInCrab = ((crabBalance + crabPendingWithdraw) *
            getCrabFairPrice()) /
            1e18 /
            1e12; // account for 6 decimals of USDC

        return usdcBalance + usdcPendingDeposit + amountInCrab;
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        emit StrategyDeposited(getUsdcBalance());
    }

    /// @inheritdoc IStrategy
    function withdrawToVault(
        uint256 _amount
    ) external virtual override(IStrategy) onlyManager returns (uint256) {
        if (_amount == 0) revert StrategyAmountZero();
        // TODO: check if amount could be deducted from usdc balance & crab netting

        uint256 initialUsdcBalance = getUsdcBalance();

        if (_amount <= initialUsdcBalance) {
            // withdraw immediately from usdc balance
            underlying.transfer(vault, _amount);
            return _amount;
        }

        uint256 amountRemaining = _amount - getUsdcBalance();

        uint256 queuedDeposit = crabNetting.usdBalance(address(this));

        if (amountRemaining <= queuedDeposit) {
            // withdraw immediately from queued deposit
            crabNetting.withdrawUSDC(amountRemaining, true);
            underlying.transfer(vault, _amount);
            return _amount;
        }

        // withdraw what is possible from queued deposit
        if (queuedDeposit > 0) {
            crabNetting.withdrawUSDC(queuedDeposit, true);
            amountRemaining -= queuedDeposit;
        }

        // withdraw remaining amount from the crab strategy
        uint256 crabBalance = crabStrategyV2.balanceOf(address(this));
        uint256 crabToWithdraw = (amountRemaining * 1e18 * 1e12) / // account for 12 decimals difference
            getCrabFairPrice();

        if (crabToWithdraw > crabBalance) crabToWithdraw = crabBalance;

        uint256 squeethPriceInWeth = getOraclePrice(
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

        uint256 amountWithdrawnFromCrab = swapEthToUSDC(
            getEthBalance(),
            amountRemaining.pctOf(9900)
        );

        uint256 totalUsdcWithdrawn = _amount -
            amountRemaining +
            amountWithdrawnFromCrab;
        underlying.transfer(vault, totalUsdcWithdrawn);
        emit StrategyWithdrawn(totalUsdcWithdrawn);

        return totalUsdcWithdrawn;
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

    function getUsdcBalance() public view returns (uint256) {
        return underlying.balanceOf(address(this));
    }

    function getEthBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function swapAndFlashDeposit(
        uint256 _usdcAmount,
        uint256 _ethAmountOutMin, // amount of eth to receive from usdc -> eth swap
        uint256 _ethAmountToBorrow
    ) external {
        swapUsdcForEth(_usdcAmount, _ethAmountOutMin);

        flashDeposit(getEthBalance(), _ethAmountToBorrow);
    }

    // @param _ethAmount amount of eth to send as msg.value in falshDeposit call
    // @param _ethAmountToBorrow amount of eth that will be borrowed in uni v3 flash swap
    function flashDeposit(
        uint256 _ethAmount,
        uint256 _ethAmountToBorrow
    ) public onlyKeeper {
        // TODO: check the crab strategy collateral cap
        uint256 ethBalance = getEthBalance();
        if (_ethAmount > ethBalance) revert StrategyEthAmountTooHigh();

        // NOTE: eth amount to borrow is hardcoded since it is impossible to get the precise estimate on-chain
        // this is because the amount of eth to borrow depends on the amount of squeeth that will be minted (and used to repay the flas swap debt),
        // which again depends on the total amount of eth to be deposited (borrowed + owned), a catch22 situation.
        // Because of this, invest cannot directly deposit to the opyn crab strategy, but instead it has to rely on another function that will be called from backend.
        // The backend must determine the amount of eth to borrow from uni v3 pool, and then call the flashDeposit function
        crabStrategyV2.flashDeposit{value: _ethAmount}(
            _ethAmount + _ethAmountToBorrow,
            wethOSqthPool.fee()
        );

        // swap eth leftovers to usdc
        swapEthToUSDC(getEthBalance(), 0);
    }

    function flashWithdraw(
        uint256 _crabAmount,
        uint256 _maxEthToPayForDebt,
        uint256 _usdcAmountOutMin
    ) public onlyKeeper {
        if (_crabAmount == 0) revert StrategyAmountZero();

        uint256 crabBalance = crabStrategyV2.balanceOf(address(this));
        if (crabBalance == 0) revert StrategyNotEnoughShares();

        if (_crabAmount > crabBalance) {
            _crabAmount = crabBalance;
        }

        crabStrategyV2.flashWithdraw(
            _crabAmount,
            _maxEthToPayForDebt,
            wethOSqthPool.fee()
        );

        swapEthToUSDC(getEthBalance(), _usdcAmountOutMin);
    }

    function queueUSDC(uint256 _amount) external onlyKeeper {
        if (_amount == 0) revert StrategyAmountZero();
        uint256 usdcBalance = getUsdcBalance();

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
        uint256 squeethPriceInEth = getOraclePrice(
            address(wethOSqthPool),
            oSqth,
            weth
        );
        uint256 ethPriceInUsd = getOraclePrice(
            address(usdcWethPool),
            weth,
            underlying
        );

        (, , uint256 collateral, uint256 squeethDebt) = crabStrategyV2
            .getVaultDetails();

        uint256 crabFairPrice = ((collateral -
            ((squeethDebt * squeethPriceInEth) / 1e18)) * ethPriceInUsd) /
            crabStrategyV2.totalSupply();

        return crabFairPrice;
    }

    function getOraclePrice(
        address pool,
        IERC20 base,
        IERC20 quote
    ) public view returns (uint256) {
        return
            oracle.getTwap(
                pool,
                address(base),
                address(quote),
                TWAP_PERIOD,
                true // check period
            );
    }

    function swapUsdcForEth(
        uint256 _usdcAmount,
        uint256 _ethAmountOutMin
    ) public onlyKeeper returns (uint256) {
        if (_usdcAmount == 0) revert StrategyAmountZero();

        uint256 usdcBalance = getUsdcBalance();
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

    function swapEthToUSDC(
        uint256 _ethAmount,
        uint256 _usdcAmountOutMin
    ) public returns (uint256) {
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

    receive() external payable {}
}
