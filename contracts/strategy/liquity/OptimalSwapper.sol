// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

import "../../interfaces/uniswap/IUniv2LikeRouter01.sol";
import "../../interfaces/curve/ICurveRouter.sol";

/**
    @title Swaps a token pair according to a hardcoded swap path & protocol by the owner
 */
contract OptimalSwapper is Ownable {
    error CurvePoolNotSetForPair(address fromToken, address toToken);
    error CurveRouterAddressNotSet();

    enum RouterType {
        Curve,
        UniswapV2Like,
        UniswapV3
    }

    struct TokenPairInfo {
        // ROUTER
        address router;
        // swap path
        address[] path;
    }

    ICurveRouter public immutable curveRouter;
    ISwapRouter public immutable uniswapV3Router;

    /// @notice router type to each for a particular token pair swap
    mapping(uint256 => RouterType) public routerType;
    /// @notice Info of each UniswapV2 TokenPair
    mapping(uint256 => TokenPairInfo) public pairRouter;
    /// @notice swap path to use for UniswapV3 Token pair
    mapping(uint256 => bytes) public uniswapV3Path;
    /// @notice Curve pool to use for a particular token pair swap
    mapping(uint256 => address) public curvePool;

    constructor(address _CURVE_ROUTER, address _UNISWAP_V3_ROUTER) {
        curveRouter = ICurveRouter(_CURVE_ROUTER);
        uniswapV3Router = ISwapRouter(_UNISWAP_V3_ROUTER);
    }

    function swap(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 expectedOutput
    ) external payable returns (uint256 output) {
        uint256 pairKey = getPairKey(fromToken, toToken);
        RouterType routerTypeInUse = routerType[pairKey];

        if (routerTypeInUse == RouterType.Curve) {
            output = swapWithCurve(
                fromToken,
                toToken,
                amount,
                expectedOutput,
                pairKey
            );
        } else if (routerTypeInUse == RouterType.UniswapV2Like) {
            output = swapWithUniswapV2(
                fromToken,
                toToken,
                amount,
                expectedOutput
            );
        } else if (routerTypeInUse == RouterType.UniswapV3) {
            output = swapWithUniswapV3(amount, expectedOutput, pairKey);
        }
    }

    function swapWithUniswapV2(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 expectedOutput
    ) public returns (uint256 output) {
        (address router, address[] memory path) = getRouterAndPath(
            fromToken,
            toToken
        );

        uint256[] memory amounts = IUniv2LikeRouter01(router)
            .swapExactTokensForTokens(
                amount,
                expectedOutput,
                path,
                toToken,
                block.timestamp
            );

        return amounts[amounts.length - 1];
    }

    function swapWithCurve(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 expectedOutput,
        uint256 pairKey
    ) public payable returns (uint256 output) {
        if (address(curveRouter) == address(0))
            revert CurveRouterAddressNotSet();
        address curvePoolToUse = curvePool[pairKey];
        if (curvePoolToUse == address(0))
            revert CurvePoolNotSetForPair(fromToken, toToken);

        output = curveRouter.exchange(
            curvePoolToUse,
            fromToken,
            toToken,
            amount,
            expectedOutput,
            msg.sender
        );
    }

    function swapWithUniswapV3(
        uint256 amount,
        uint256 expectedOutput,
        uint256 pairKey
    ) public payable returns (uint256 output) {
        bytes memory path = uniswapV3Path[pairKey];

        ISwapRouter.ExactInputParams memory params = ISwapRouter
            .ExactInputParams({
                path: path,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: amount,
                amountOutMinimum: expectedOutput
            });

        // Executes the swap.
        output = uniswapV3Router.exactInput(params);
    }

    // --------------------------------------------------------------
    // VIEW Functions
    // --------------------------------------------------------------

    function getUniV2Quote(
        address fromToken,
        address toToken,
        uint256 amount
    ) public view returns (uint256) {
        (address router, address[] memory path) = getRouterAndPath(
            fromToken,
            toToken
        );

        uint256[] memory amounts = IUniv2LikeRouter01(router).getAmountsOut(
            amount,
            path
        );

        return amounts[amounts.length - 1];
    }

    function getCurveQuote(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 pairKey
    ) public view returns (uint256 curveQuote) {
        address curvePoolToUse = curvePool[pairKey];
        if (curvePoolToUse == address(0))
            revert CurvePoolNotSetForPair(fromToken, toToken);

        curveQuote = curveRouter.get_exchange_amount(
            curvePoolToUse,
            fromToken,
            toToken,
            amount
        );
    }

    function getUniV3Quote(
        address fromToken,
        address toToken,
        uint256 amount
    ) public view returns (uint256 quote) {}

    function getPairKey(address fromToken, address toToken)
        public
        pure
        returns (uint256)
    {
        return uint256(uint160(fromToken)) + uint256(uint160(toToken));
    }

    // --------------------------------------------------------------
    // ROUTER Manage
    // --------------------------------------------------------------

    function updateUniswapPairRouter(address router, address[] calldata path)
        external
        onlyOwner
    {
        uint256 pairKey = getPairKey(path[0], path[path.length - 1]);
        TokenPairInfo storage pairInfo = pairRouter[pairKey];

        pairInfo.router = router;
        pairInfo.path = path;
    }

    function updateUniswapV3Path(
        address fromToken,
        address toToken,
        bytes calldata path
    ) external onlyOwner {
        uint256 pairKey = getPairKey(fromToken, toToken);
        uniswapV3Path[pairKey] = path;
    }

    function setCurvePool(
        address pool,
        address fromToken,
        address toToken
    ) external onlyOwner {
        curvePool[getPairKey(fromToken, toToken)] = pool;
    }

    // --------------------------------------------------------------
    // Internal
    // --------------------------------------------------------------

    function getRouterAndPath(address fromToken, address toToken)
        internal
        view
        returns (address router, address[] memory path)
    {
        uint256 pairKey = getPairKey(fromToken, toToken);
        TokenPairInfo storage pairInfo = pairRouter[pairKey];

        require(pairInfo.router != address(0), "router not set");

        router = pairInfo.router;

        path = new address[](pairInfo.path.length);
        if (pairInfo.path[0] == fromToken) {
            path = pairInfo.path;
        } else {
            for (uint256 index = 0; index < pairInfo.path.length; index++) {
                path[index] = (pairInfo.path[pairInfo.path.length - 1 - index]);
            }
        }
    }
}
