// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../../interfaces/uniswap/IUniv2LikeRouter01.sol";
import "../../interfaces/curve/ICurveRouter.sol";

/**
    @title Finds the optimal swap for a given from token and to token    
 */
contract OptimalSwap is Ownable {
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

    address public immutable CURVE_ROUTER;
    /// @notice router type to each for a particular token pair swap
    mapping(uint256 => RouterType) public routerType;
    /// @notice Info of each Uniswap TokenPair
    mapping(uint256 => TokenPairInfo) public pairRouter;
    /// @notice Curve pool to use for a particular token pair swap
    mapping(uint256 => address) public curvePool;

    constructor(address _CURVE_ROUTER) {
        CURVE_ROUTER = _CURVE_ROUTER;
    }

    function swap(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 expectedOutput
    ) external returns (uint256 output) {
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
        }
    }

    function swapWithCurve(
        address fromToken,
        address toToken,
        uint256 amount,
        uint256 expectedOutput,
        uint256 pairKey
    ) public payable returns (uint256 output) {
        if (CURVE_ROUTER == address(0)) revert CurveRouterAddressNotSet();
        address curvePoolToUse = curvePool[pairKey];
        if (curvePoolToUse == address(0))
            revert CurvePoolNotSetForPair(fromToken, toToken);

        output = ICurveRouter(CURVE_ROUTER).exchange(
            curvePoolToUse,
            fromToken,
            toToken,
            amount,
            expectedOutput,
            msg.sender
        );
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

    function getData(
        address fromToken,
        address toToken,
        uint256 amount
    ) external view returns (uint256 price) {
        uint256 pairKey = getPairKey(fromToken, toToken);
        RouterType routerTypeInUse = routerType[pairKey];

        if (routerTypeInUse == RouterType.Curve) {
            price = getCurveQuote(fromToken, toToken, amount, pairKey);
        } else if (routerTypeInUse == RouterType.UniswapV2Like) {
            price = getUniV2Quote(fromToken, toToken, amount);
        }
    }

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
        // This revert check is not needed since the method will revert anyway if curve router is zero address
        // if (CURVE_ROUTER == address(0)) revert CurveRouterAddressNotSet();
        address curvePoolToUse = curvePool[pairKey];
        if (curvePoolToUse == address(0))
            revert CurvePoolNotSetForPair(fromToken, toToken);

        curveQuote = ICurveRouter(CURVE_ROUTER).get_exchange_amount(
            curvePoolToUse,
            fromToken,
            toToken,
            amount
        );
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

    function getPairKey(address fromToken, address toToken)
        public
        pure
        returns (uint256)
    {
        return uint256(uint160(fromToken)) + uint256(uint160(toToken));
    }
}
