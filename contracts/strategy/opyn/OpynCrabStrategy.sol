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

    // address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    // address public constant oSQTH = 0xf1B99e3E573A1a9C5E6B2Ce818b617F0E664E86B;
    // address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    // address public constant ORACLE = 0x65D66c76447ccB45dAf1e8044e918fA786A483A1;

    IWETH public weth;
    IERC20 public oSqth;
    ICrabStrategyV2 public crabStrategy;
    ICrabNetting public crabNetting;
    address public wethOsqthPool;
    address public usdcWethPool;
    ISwapRouter public swapRouter;
    IOracle public oracle;

    constructor(
        address _vault,
        address _admin,
        address _keeper,
        IERC20 _underlying, // USDC,
        IWETH _weth,
        IERC20 _oSqth,
        ICrabStrategyV2 _crabStrategy,
        ICrabNetting _crabNetting,
        address _wethOsqthPool,
        address _usdcWethPool,
        ISwapRouter _swapRouter,
        IOracle _oracle
    ) BaseStrategy(_vault, _underlying, _admin) {
        // underlying.safeIncreaseAllowance(
        //     address(_crabHelper),
        //     type(uint256).max
        // );

        _grantRole(KEEPER_ROLE, _keeper);

        weth = _weth;
        oSqth = _oSqth;
        crabStrategy = _crabStrategy;
        crabNetting = _crabNetting;
        wethOsqthPool = _wethOsqthPool;
        usdcWethPool = _usdcWethPool;
        swapRouter = _swapRouter;
        oracle = _oracle;
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
            underlying.balanceOf(address(this)) > 0 ||
            crabStrategy.balanceOf(address(this)) > 0;
    }

    // 155796485951247848 - 92143313564999 = 155704242637582549 total eth deposited
    // 79135025576445512 * 2008 / 10000 =

    /// @inheritdoc IStrategy
    function investedAssets()
        public
        view
        virtual
        override(IStrategy)
        returns (uint256)
    {
        console.log("\n### INVESTED ASSETS ###\n");

        uint256 crabBalance = crabStrategy.balanceOf(address(this));
        // uint256 squeethDebt = crabStrategy.getWsqueethFromCrabAmount(
        //     crabBalance
        // );
        // uint256 squeethPriceInWeth = getOraclePrice(wethOsqthPool, oSqth, weth);
        // uint256 wethPriceInUsdc = getOraclePrice(
        //     usdcWethPool,
        //     weth,
        //     underlying
        // );

        // uint256 squeethDebtInWeth = (squeethDebt * squeethPriceInWeth) / 1e18;

        // // uint16 collateralizationRatioPct = _getCrabStrategyCollateralizationRatio();
        // // (, , uint256 strategyCollateral, uint256 strategyDebt) = crabStrategy
        // //     .getVaultDetails();

        // // uint256 strategyDebtInEth = getQuoteFromOracle(
        // //     wethOsqthPool,
        // //     address(oSqth),
        // //     address(weth),
        // //     strategyDebt
        // // );

        // // return strategyCollateral.inPctOf(strategyDebtInEth);

        // (, , uint256 strategyCollateral, uint256 strategyDebt) = crabStrategy
        //     .getVaultDetails();
        // uint256 strategyDebtInEth = (strategyDebt * squeethPriceInWeth) / 1e18;

        // uint16 collateralizationRatioPct = strategyCollateral.inPctOf(
        //     strategyDebtInEth
        // );

        // uint redeemableCollateral = squeethDebtInWeth.pctOf(
        //     collateralizationRatioPct - 10000
        // );

        // uint256 redeemableCollateralInUsdc = (redeemableCollateral *
        //     wethPriceInUsdc) /
        //     1e18 /
        //     1e12;

        // uint256 invested = redeemableCollateralInUsdc +
        //     underlying.balanceOf(address(this));

        // console.log("collateralization ratio\t", collateralizationRatioPct);
        // console.log("crabBalance\t\t", crabBalance);
        // console.log("squeethDebt\t\t", squeethDebt);
        // console.log("squeethDebtInWeth\t", squeethDebtInWeth);
        // console.log("redeemableCollateral\t", redeemableCollateral);
        // console.log("redeemableInUsdc\t", redeemableCollateralInUsdc);
        // console.log("invested assets\t\t", invested);

        uint256 invested2 = (crabBalance * getCrabFairPrice()) /
            1e18 +
            underlying.balanceOf(address(this));
        console.log("invested assets 2\t", invested2);

        return invested2;
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        console.log("\n### INVEST ###\n");
        // TODO: emit event
    }

    /// @inheritdoc IStrategy
    function withdrawToVault(
        uint256 amount
    ) external virtual override(IStrategy) onlyManager returns (uint256) {
        if (amount == 0) revert StrategyAmountZero();
        // TODO: check if amount could be deducted from usdc balance

        uint256 usdcBalance = underlying.balanceOf(address(this));
        uint256 amountInUsdcToWithdrawFromCrab;
        if (amount <= usdcBalance) {
            // withdraw immediately from usdc balance
            amountInUsdcToWithdrawFromCrab = 0;
            // transfer usdc to vault
            return 0;
        } else {
            amountInUsdcToWithdrawFromCrab = amount - usdcBalance;
        }

        uint256 invested = investedAssets();

        console.log("\n### WITHDRAW ###\n");
        uint256 crabBalance = crabStrategy.balanceOf(address(this));

        // get amount of crab needed to cover withdrawal amount
        uint256 crabNeeded = (crabBalance * amountInUsdcToWithdrawFromCrab) /
            invested;

        console.log("*crabNeeded\t", crabNeeded);
        crabNeeded = crabNeeded > crabBalance ? crabBalance : crabNeeded;

        // get amount in squeeth needed to cover withdrawal amount
        uint256 squeethNeeded = crabStrategy.getWsqueethFromCrabAmount(
            crabNeeded
        );
        //1,126,711,412,608,942
        uint256 squeethPriceInWeth = getOraclePrice(wethOsqthPool, oSqth, weth);

        // get amount in eth needed to repay squeeth debth (cover withdrawal amount)
        uint256 ethNeeded = (squeethNeeded * squeethPriceInWeth) / 1e18;

        // max amount of eth to used to repay short squeeth position which has to be done to release collateral in the crab strategy.
        // has to be grater than ethNeeded to cover fees and slippage
        uint256 maxEthUsedInFlashSwap = ethNeeded.pctOf(10100); // 1% more to cover fee & slippage

        uint256 crabToWithdraw = (amountInUsdcToWithdrawFromCrab * 1e18) /
            getCrabFairPrice();

        console.log("amount\t\t\t", amount);
        console.log("invested\t\t", invested);
        console.log("usdcBalance\t\t", usdcBalance);
        console.log("crabBalance\t\t", crabBalance);
        console.log("crabNeeded\t\t", crabNeeded);
        console.log("crabToWithdraw\t\t", crabToWithdraw);
        console.log("crabFairPrice\t\t", getCrabFairPrice());
        console.log("squeethNeeded\t\t", squeethNeeded);
        console.log("ethNeeded\t\t", ethNeeded);
        console.log("maxEthUsedInFlashSwap\t", maxEthUsedInFlashSwap);

        // TODO: find actual amount withdrawn
        crabStrategy.flashWithdraw(
            crabNeeded,
            maxEthUsedInFlashSwap,
            IUniswapV3Pool(wethOsqthPool).fee()
        );

        // TODO: transfer to vault

        console.log("\n* after flash withdraw *");
        console.log("usdc balance", underlying.balanceOf(address(this)));
        console.log("eth balance", address(this).balance);
        console.log("crab balance", crabStrategy.balanceOf(address(this)));

        swapEthToUSDC();
        console.log("\n* after swap eth to usdc *");
        console.log("eth balance", address(this).balance);
        console.log("usdc balance", underlying.balanceOf(address(this)));

        return 0;
    }

    /// @inheritdoc IStrategy
    function transferYield(
        address,
        uint256
    ) external virtual override(BaseStrategy) onlyManager returns (uint256) {
        return 0;
    }

    // TODO: onlyKeeper
    // @param _ethAmount amount of eth to send as msg.value in falshDeposit call
    // @param _ethAmountToBorrow amount of eth that will be borrowed in uni v3 flash swap
    function flashDepositToCrabStrategy(
        uint256 _usdcAmount,
        uint256 _ethAmountOutMin, // amount of eth to receive from usdc -> eth swap
        uint256 _ethAmountToBorrow
    ) public {
        // TODO: check the crab strategy collateral cap
        // uint256 balance = underlying.balanceOf(address(this));
        swapUsdcToEth(_usdcAmount, _ethAmountOutMin);

        uint256 ethBalance = address(this).balance;
        console.log("ethBalance\t\t", ethBalance);
        // NOTE: eth amount to borrow is hardcoded since it is impossible to get the precise estimate on-chain
        // this is because the amount of eth to borrow depends on the amount of squeeth that will be minted (and used to repay the flas swap debt),
        //  which again depends on the total amount of eth to be deposited (borrowed + owned), a catch22 situation.
        // Because of this, invest cannot directly deposit to the opyn crab strategy, but instead it has to rely on another function that will be called from backend.
        // The backend must determine the amount of eth to borrow from uni v3 pool, and then call the flashDepositToCrabStrategy function.
        // NOTE: eth amount to borrow must be less than eth owned (including fees and slippage), otherwise deposit transaction reverts (crab strategy collateral ratio has to remain the same)
        // uint256 ethAmountToBorrow = (ethBalance * 984) / 1000; // 2% less
        uint256 totalEthToDeposit = ethBalance + _ethAmountToBorrow;

        console.log("ethAmount\t\t", ethBalance);
        console.log("ethAmountToBorrow\t", _ethAmountToBorrow);
        console.log("totalEthToDeposit\t", totalEthToDeposit);

        crabStrategy.flashDeposit{value: ethBalance}(
            ethBalance + _ethAmountToBorrow,
            IUniswapV3Pool(wethOsqthPool).fee()
        ); // 0.3% uniswap pool fee

        console.log("\n* after flash deposit *");
        console.log("ethAmount\t\t", address(this).balance);
        console.log("wehtAmount\t\t", weth.balanceOf(address(this)));
        console.log("usdcAmount\t\t", underlying.balanceOf(address(this)));
        console.log("crabAmount\t\t", crabStrategy.balanceOf(address(this)));
        console.log("sqeethAmount\t\t", oSqth.balanceOf(address(this)));

        // swap eth amount not used for covering the slippage costs
        swapEthToUSDC();

        console.log("\n* after swap eth leftovers to usdc *");
        console.log("ethAmount\t\t", address(this).balance);
        console.log("usdcAmount\t\t", underlying.balanceOf(address(this)));
    }

    // TODO: onlyKeeper
    function flashWithdrawFromCrabStrategy(
        uint256 _crabAmount,
        uint256 _maxEthToPayForDebt
    ) public {
        uint256 crabBalance = crabStrategy.balanceOf(address(this));

        if (_crabAmount > crabBalance) {
            _crabAmount = crabBalance;
        }

        // get amount in squeeth needed to cover withdrawal amount
        // uint256 squeethNeeded = crabStrategy.getWsqueethFromCrabAmount(
        //     _crabAmount
        // );

        // uint256 squeethPriceInWeth = getOraclePrice(wethOsqthPool, oSqth, weth);

        // uint256 ethNeeded = (squeethNeeded * squeethPriceInWeth) / 1e18;

        crabStrategy.flashWithdraw(
            _crabAmount,
            _maxEthToPayForDebt,
            IUniswapV3Pool(wethOsqthPool).fee()
        );

        swapEthToUSDC();
    }

    function depositToCrabNetting(uint256 _usdcAmount) external {
        uint256 usdcBalance = underlying.balanceOf(address(this));

        if (_usdcAmount > usdcBalance) {
            _usdcAmount = usdcBalance;
        }

        underlying.approve(address(crabNetting), _usdcAmount);
        crabNetting.depositUSDC(_usdcAmount);
    }

    function withdrawFromCrabNetting(uint256 _usdcAmount) public {
        uint256 usdcBalance = underlying.balanceOf(address(this));

        if (_usdcAmount > usdcBalance) {
            _usdcAmount = usdcBalance;
        }
        uint256 queuedAmount = crabNetting.usdBalance(address(this));

        crabNetting.withdrawUSDC(_usdcAmount, true);
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
                420 seconds, // period
                true // check period
            );
    }

    function swapUsdcToEth(uint256 _amount, uint256 _amountOutMin) internal {
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: address(underlying),
                tokenOut: address(weth),
                fee: IUniswapV3Pool(usdcWethPool).fee(),
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _amount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        underlying.approve(address(swapRouter), params.amountIn);

        uint256 amountOut = swapRouter.exactInputSingle(params);

        console.log("amountOut\t\t", amountOut);

        weth.withdraw(amountOut);
    }

    function swapEthToUSDC() internal {
        uint256 ethBalance = address(this).balance;

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: address(weth),
                tokenOut: address(underlying),
                fee: IUniswapV3Pool(usdcWethPool).fee(),
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: ethBalance,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        weth.deposit{value: ethBalance}();

        weth.approve(address(swapRouter), ethBalance);

        swapRouter.exactInputSingle(params);
    }

    receive() external payable {
        console.log("received eth \t\t", msg.value);
    }

    function getCrabFairPrice() public view returns (uint256) {
        // Get twap
        uint256 squeethEthPrice = IOracle(oracle).getTwap(
            wethOsqthPool,
            address(oSqth),
            address(weth),
            420 seconds,
            true
        );

        uint256 usdcEthPrice = IOracle(oracle).getTwap(
            0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8, // usdcWethPool,
            address(weth),
            address(underlying),
            420 seconds,
            true
        );

        (, , uint256 collateral, uint256 debt) = crabStrategy.getVaultDetails();

        uint256 crabFairPrice = ((collateral -
            ((debt * squeethEthPrice) / 1e18)) * usdcEthPrice) /
            crabStrategy.totalSupply();

        // crabFairPrice = crabFairPrice / 1e12;

        return crabFairPrice / 1e12;
    }

    // TODO: not really needed function
    function checkCrabPrice(uint256 _price) public view returns (uint256) {
        // Get twap
        uint256 squeethEthPrice = IOracle(oracle).getTwap(
            wethOsqthPool,
            address(oSqth),
            address(weth),
            420 seconds,
            true
        );
        uint256 usdcEthPrice = IOracle(oracle).getTwap(
            0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8, // usdcWethPool,
            address(weth),
            address(underlying),
            420 seconds,
            true
        );
        (, , uint256 collateral, uint256 debt) = crabStrategy.getVaultDetails();
        uint256 crabFairPrice = ((collateral -
            ((debt * squeethEthPrice) / 1e18)) * usdcEthPrice) /
            crabStrategy.totalSupply();
        crabFairPrice = crabFairPrice / 1e12; //converting from units of 18 to 6

        console.log("crabFairPrice\t\t", crabFairPrice);

        console.log(
            "N23\t\t",
            (crabFairPrice * (1e18 + crabNetting.otcPriceTolerance())) / 1e18
        );

        console.log(
            "N24\t\t",
            (crabFairPrice * (1e18 - crabNetting.otcPriceTolerance())) / 1e18
        );

        require(
            _price <=
                (crabFairPrice * (1e18 + crabNetting.otcPriceTolerance())) /
                    1e18,
            "N23"
        );
        require(
            _price >=
                (crabFairPrice * (1e18 - crabNetting.otcPriceTolerance())) /
                    1e18,
            "N24"
        );

        return crabFairPrice;
    }
}
