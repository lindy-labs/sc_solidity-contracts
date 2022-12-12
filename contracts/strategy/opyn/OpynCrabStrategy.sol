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
import {OracleLibrary} from "../../lib/uniswap/OracleLibrary.sol";
import {ICurveExchange} from "../../interfaces/curve/ICurveExchange.sol";

import "hardhat/console.sol";

interface ICrabStrategyV2 is IERC20 {
    /**
     * @notice get the vault composition of the strategy
     * @return operator
     * @return nft collateral id
     * @return collateral amount
     * @return short amount
     */
    function getVaultDetails()
        external
        view
        returns (address, uint256, uint256, uint256);

    /**
     * @notice flash deposit into strategy, providing ETH, selling wSqueeth and receiving strategy tokens
     * @dev this function will execute a flash swap where it receives ETH, deposits and mints using flash swap proceeds and msg.value, and then repays the flash swap with wSqueeth
     * @dev _ethToDeposit must be less than msg.value plus the proceeds from the flash swap
     * @dev the difference between _ethToDeposit and msg.value provides the minimum that a user can receive for their sold wSqueeth
     * @param _ethToDeposit total ETH that will be deposited in to the strategy which is a combination of msg.value and flash swap proceeds
     * @param _poolFee Uniswap pool fee
     */
    function flashDeposit(
        uint256 _ethToDeposit,
        uint24 _poolFee
    ) external payable;

    /**
     * @notice flash withdraw from strategy, providing strategy tokens, buying wSqueeth, burning and receiving ETH
     * @dev this function will execute a flash swap where it receives wSqueeth, burns, withdraws ETH and then repays the flash swap with ETH
     * @param _crabAmount strategy token amount to burn
     * @param _maxEthToPay maximum ETH to pay to buy back the wSqueeth debt
     * @param _poolFee Uniswap pool fee
     */
    function flashWithdraw(
        uint256 _crabAmount,
        uint256 _maxEthToPay,
        uint24 _poolFee
    ) external;

    function deposit() external payable;

    function getWsqueethFromCrabAmount(
        uint256 _crabAmount
    ) external view returns (uint256);
}

interface IWETH is IERC20 {
    function deposit() external payable;

    function withdraw(uint256 wad) external;
}

interface ISqueethController {}

interface ICrabHelper {
    function flashDepositERC20(
        uint256 _ethToDeposit,
        uint256 _amountIn,
        uint256 _minEthToGet,
        uint24 _erc20Fee,
        uint24 _wPowerPerpFee,
        address _tokenIn
    ) external;

    function flashWithdrawERC20(
        uint256 _crabAmount,
        uint256 _maxEthToPay,
        address _tokenOut,
        uint256 _minAmountOut,
        uint24 _erc20Fee,
        uint24 _wPowerPerpFee
    ) external;
}

contract OpynCrabStrategy is BaseStrategy {
    using PercentMath for uint256;
    using ERC165Query for address;
    using SafeERC20 for IERC20;

    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant oSQTH = 0xf1B99e3E573A1a9C5E6B2Ce818b617F0E664E86B;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    ICrabStrategyV2 crabStrategy;
    ICrabHelper crabHelper;
    address wethOsqthPool;
    address usdcWethPool;
    ISwapRouter swapRouter;

    /**
     * @param _vault address of the vault that will use this strategy
     * @param _admin address of the administrator account for this strategy
     * @param _underlying address of the underlying token
     */
    constructor(
        address _vault,
        address _admin,
        address _keeper,
        IERC20 _underlying,
        ICrabStrategyV2 _crabStrategy,
        ICrabHelper _crabHelper,
        address _wethOsqthPool,
        address _usdcWethPool,
        ISwapRouter _swapRouter
    ) BaseStrategy(_vault, _underlying, _admin) {
        underlying.safeIncreaseAllowance(
            address(_crabHelper),
            type(uint256).max
        );

        _grantRole(KEEPER_ROLE, _keeper);

        crabStrategy = _crabStrategy;
        crabHelper = _crabHelper;
        wethOsqthPool = _wethOsqthPool;
        usdcWethPool = _usdcWethPool;
        swapRouter = _swapRouter;
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
        uint256 squeethDebt = crabStrategy.getWsqueethFromCrabAmount(
            crabBalance
        );

        uint256 squeethDebtInWeth = getQuoteFromOracle(
            wethOsqthPool,
            oSQTH,
            WETH,
            squeethDebt
        );

        uint16 collateralizationRatioPct = getCrabStrategyCollateralizationRatio();

        uint redeemableCollateral = squeethDebtInWeth.pctOf(
            collateralizationRatioPct - 10000
        );

        uint256 redeemableCollateralInUsdc = getQuoteFromOracle(
            usdcWethPool,
            WETH,
            USDC,
            redeemableCollateral
        );

        uint256 invested = redeemableCollateralInUsdc +
            underlying.balanceOf(address(this));

        console.log("collateralization ratio\t", collateralizationRatioPct);
        console.log("crabBalance\t\t", crabBalance);
        console.log("squeethDebt\t\t", squeethDebt);
        console.log("squeethDebtInWeth\t", squeethDebtInWeth);
        console.log("redeemableCollateral\t", redeemableCollateral);
        console.log("redeemableInUsdc\t", redeemableCollateralInUsdc);
        console.log("invested assets\t\t", invested);

        return invested;
    }

    // TODO: onlyKeeper
    // @param _ethAmount amount of eth to send as msg.value in falshDeposit call
    // @param _ethAmountToBorrow amount of eth that will be borrowed in uni v3 flash swap
    function flashDepositToCrabStrategy(
        uint256 _ethAmount,
        uint256 _ethAmountToBorrow
    ) public {
        // TODO: check the crab strategy collateral cap

        crabStrategy.flashDeposit{value: _ethAmount}(
            _ethAmount + _ethAmountToBorrow,
            3000
        ); // 0.3% uniswap pool fee

        console.log("\n* after flash deposit *");
        console.log("ethAmount\t\t", address(this).balance);
        console.log("wehtAmount\t\t", IWETH(WETH).balanceOf(address(this)));
        console.log("usdcAmount\t\t", underlying.balanceOf(address(this)));
        console.log("crabAmount\t\t", crabStrategy.balanceOf(address(this)));
        console.log("sqeethAmount\t\t", IERC20(oSQTH).balanceOf(address(this)));

        // swap eth amount not used for covering the slippage costs
        swapEthToUSDC();

        console.log("\n* after swap eth leftovers to usdc *");
        console.log("ethAmount\t\t", address(this).balance);
        console.log("usdcAmount\t\t", underlying.balanceOf(address(this)));
    }

    /// @inheritdoc IStrategy
    function invest() external virtual override(IStrategy) onlyManager {
        console.log("\n### INVEST ###\n");
        // TOOD: emit event for backend

        swapUsdcToEth();

        uint256 ethAmount = address(this).balance;
        // NOTE: eth amount to borrow is hardcoded since it is impossible to get the precise estimate on-chain
        // this is because the amount of eth to borrow depends on the amount of squeeth that will be minted (and used to repay the flas swap debt),
        //  which again depends on the total amount of eth to be deposited (borrowed + owned), a catch22 situation.
        // Because of this, invest cannot directly deposit to the opyn crab strategy, but instead it has to rely on another function that will be called from backend.
        // The backend must determine the amount of eth to borrow from uni v3 pool, and then call the flashDepositToCrabStrategy function.
        // NOTE: eth amount to borrow must be less than eth owned (including fees and slippage), otherwise deposit transaction reverts (crab strategy collateral ratio has to remain the same)
        uint256 ethAmountToBorrow = (ethAmount * 984) / 1000; // 2% less
        uint256 totalEthToDeposit = ethAmount + ethAmountToBorrow;

        console.log("ethAmount\t\t", ethAmount);
        console.log("ethAmountToBorrow\t", ethAmountToBorrow);
        console.log("totalEthToDeposit\t", totalEthToDeposit);

        flashDepositToCrabStrategy(ethAmount, ethAmountToBorrow);
    }

    /// @inheritdoc IStrategy
    function withdrawToVault(
        uint256 amount
    ) external virtual override(IStrategy) onlyManager {
        if (amount == 0) revert StrategyAmountZero();
        // TODO: check if amount could be deducted from usdc balance

        uint256 usdcBalance = underlying.balanceOf(address(this));
        uint256 amountInUsdcToWithdrawFromCrab;
        if (amount <= usdcBalance) {
            // withdraw immediately from usdc balance
            amountInUsdcToWithdrawFromCrab = 0;
            // transfer usdc to vault
            return;
        } else {
            amountInUsdcToWithdrawFromCrab = amount - usdcBalance;
        }

        uint256 invested = investedAssets();

        console.log("\n### WITHDRAW ###\n");
        uint256 crabBalance = crabStrategy.balanceOf(address(this));

        // get amount of crab needed to cover withdrawal amount
        uint256 crabNeeded = (crabBalance * amount) / invested;
        crabNeeded = crabNeeded > crabBalance ? crabBalance : crabNeeded;

        // get amount in squeeth needed to cover withdrawal amount
        uint256 squeethNeeded = crabStrategy.getWsqueethFromCrabAmount(
            crabNeeded
        );

        // get amount in eth needed to repay squeeth debth (cover withdrawal amount)
        uint256 ethNeeded = getQuoteFromOracle(
            wethOsqthPool,
            oSQTH,
            WETH,
            squeethNeeded
        );

        // max amount of eth to be used in uni v3 flash swap, has to be grate than ethNeeded to cover fees and slippage
        uint maxEthUsedInFlashSwap = ethNeeded.pctOf(10100); // 1% more to cover fee & slippage

        crabStrategy.approve(address(crabHelper), crabNeeded);

        console.log("amount\t\t\t", amount);
        console.log("invested\t\t", invested);
        console.log("usdcBalance\t\t", usdcBalance);
        console.log("crabBalance\t\t", crabBalance);
        console.log("crabNeeded\t\t", crabNeeded);
        console.log("squeethNeeded\t\t", squeethNeeded);
        console.log("ethNeeded\t", ethNeeded);
        console.log("maxEthUsedInFlashSwap\t", maxEthUsedInFlashSwap);

        crabStrategy.flashWithdraw(
            crabNeeded,
            maxEthUsedInFlashSwap,
            3000 // pool fee
        );

        console.log("\n* after flash withdraw *");
        console.log("usdc balance", underlying.balanceOf(address(this)));
        console.log("eth balance", address(this).balance);
        console.log("crab balance", crabStrategy.balanceOf(address(this)));

        swapEthToUSDC();
        console.log("\n* after swap eth to usdc *");
        console.log("eth balance", address(this).balance);
        console.log("usdc balance", underlying.balanceOf(address(this)));
    }

    /// @inheritdoc IStrategy
    function transferYield(
        address,
        uint256
    ) external virtual override(BaseStrategy) onlyManager returns (uint256) {
        return 0;
    }

    /**
     * Strategy has to be able to receive ETH because deposit/withdrawal can leave some leftovers.
     */
    receive() external payable {
        console.log("received eth \t\t", msg.value);
    }

    function getCrabStrategyCollateralizationRatio()
        internal
        view
        returns (uint16)
    {
        (, , uint256 strategyCollateral, uint256 strategyDebt) = crabStrategy
            .getVaultDetails();

        uint256 strategyDebtInEth = getQuoteFromOracle(
            wethOsqthPool,
            oSQTH,
            WETH,
            strategyDebt
        );

        return strategyCollateral.inPctOf(strategyDebtInEth);
    }

    function getQuoteFromOracle(
        address pool,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) public view returns (uint256 quote) {
        (int24 arithmeticMeanTick, ) = OracleLibrary.consult(pool, 240);

        quote = OracleLibrary.getQuoteAtTick(
            arithmeticMeanTick,
            uint128(amountIn),
            tokenIn,
            tokenOut
        );
    }

    function swapUsdcToEth() internal {
        uint256 underlyingBalance = underlying.balanceOf(address(this));

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: USDC,
                tokenOut: WETH,
                fee: 500,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: underlyingBalance,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        underlying.approve(address(swapRouter), params.amountIn);

        uint256 amountOut = swapRouter.exactInputSingle(params);

        IWETH(WETH).withdraw(amountOut);
    }

    function swapEthToUSDC() internal {
        uint256 ethBalance = address(this).balance;

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: WETH,
                tokenOut: USDC,
                fee: 500,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: ethBalance,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        IWETH(WETH).deposit{value: ethBalance}();

        IWETH(WETH).approve(address(swapRouter), ethBalance);

        swapRouter.exactInputSingle(params);
    }
}
