// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ICurve} from "../interfaces/curve/ICurve.sol";

/// Helper abstract contract to manage curve swaps
abstract contract CurveSwapper {
    using SafeERC20 for IERC20;

    /// Static 95% slippage (TODO should probably make this configurable)
    uint256 public constant SLIPPAGE = 99;

    struct Swapper {
        /// Curve pool instance
        ICurve pool;
        /// decimals in token
        uint8 tokenDecimals;
        /// decimals in underlying
        uint8 underlyingDecimals;
        /// index of the deposit token we want to exchange to/from underlying
        int128 tokenI;
        /// index of underlying used by the vault (presumably always UST)
        int128 underlyingI;
    }

    /// token => curve pool (for trading token/underlying)
    mapping(address => Swapper) public swappers;

    /// @param _tokens initial list of tokens to support
    /// @param _pools curve pool to use for each token
    /// @param _tokenIs index of _token within the given curve pool
    /// @param _underlyingIs index of the vault's underlying token within the curve pool
    function addPools(
        address[] memory _tokens,
        address[] memory _pools,
        int128[] memory _tokenIs,
        int128[] memory _underlyingIs
    ) public {
        require(_tokens.length == _pools.length, "invalid _pools length");
        require(_tokens.length == _tokenIs.length, "invalid _tokenIds length");
        require(
            _tokens.length == _underlyingIs.length,
            "invalid _underlyingsIs length"
        );

        for (uint256 i = 0; i < _tokens.length; ++i) {
            addPool(_tokens[i], _pools[i], _tokenIs[i], _underlyingIs[i]);
        }
    }

    function getUnderlying() public view virtual returns (address);

    function addPool(
        address _token,
        address _pool,
        int128 _tokenI,
        int128 _underlyingI
    ) public {
        // TODO only allowed role
        require(
            ICurve(_pool).coins(uint256(uint128(_underlyingI))) ==
                getUnderlying(),
            "_underlyingI does not match underlying token"
        );

        // TODO it seems this doesn't actually work for UST-3CRV
        // require(
        //     _pool.coins(uint256(uint128(_tokenI))) == _token,
        //     "_tokenI does not match input token"
        // );

        uint256 tokenDecimals = IERC20Metadata(_token).decimals();
        uint256 underlyingDecimals = IERC20Metadata(getUnderlying()).decimals();

        // TODO check if _token and _underlyingIndex match the pool settings
        swappers[_token] = Swapper(
            ICurve(_pool),
            uint8(tokenDecimals),
            uint8(underlyingDecimals),
            _tokenI,
            _underlyingI
        );

        _approveIfNecessary(getUnderlying(), address(_pool));
        _approveIfNecessary(_token, address(_pool));
    }

    /// Swaps a given amount of
    /// Only works if the pool has previously been inserted into the contract
    ///
    /// @param _token The token we want to swap into
    /// @param _amount The amount of underlying we want to swap
    /// TODO missing slippage checks
    function _swapIntoUnderlying(address _token, uint256 _amount)
        internal
        returns (uint256 amount)
    {
        if (_token == getUnderlying()) {
            // same token, nothing to do
            return _amount;
        }

        Swapper storage swapper = swappers[_token];

        uint256 minAmount = _calcMinDy(
            _amount,
            swapper.tokenDecimals,
            swapper.underlyingDecimals
        );

        return
            swapper.pool.exchange_underlying(
                swapper.tokenI,
                swapper.underlyingI,
                _amount,
                minAmount
            );
    }

    /// Swaps a given amount of Underlying into a given token
    /// Only works if the pool has previously been inserted into the contract
    ///
    /// @param _token The token we want to swap into
    /// @param _amount The amount of underlying we want to swap
    /// TODO missing slippage checks
    function _swapFromUnderlying(address _token, uint256 _amount)
        internal
        returns (uint256 amount)
    {
        if (_token == getUnderlying()) {
            // same token, nothing to do
            return _amount;
        }

        Swapper storage swapper = swappers[_token];

        uint256 minAmount = _calcMinDy(
            _amount,
            swapper.underlyingDecimals,
            swapper.tokenDecimals
        );

        return
            swapper.pool.exchange_underlying(
                swapper.underlyingI,
                swapper.tokenI,
                _amount,
                minAmount
            );
    }

    function _calcMinDy(
        uint256 _amount,
        uint8 _fromDecimals,
        uint8 _toDecimals
    ) internal pure returns (uint256) {
        return
            (_amount * SLIPPAGE * 10**_toDecimals) / (10**_fromDecimals * 100);
    }

    /// This is necessary because some tokens (USDT) force you to approve(0)
    /// before approving a new amount meaning if we always approved blindly,
    /// then we could get random failures on the second attempt
    function _approveIfNecessary(address _token, address _pool) internal {
        uint256 allowance = IERC20(_token).allowance(address(this), _pool);

        if (allowance == 0) {
            IERC20(_token).safeApprove(_pool, type(uint256).max);
        }
    }
}
