// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";

import {ICurve} from "../curve/ICurve.sol";
import {IClaimers} from "./IClaimers.sol";
import {IVault} from "../vault/IVault.sol";

interface ICurveSwapper {
    function underlying() public view virtual returns (address);
}

/// Helper abstract contract to manage curve swaps
abstract contract CurveSwapper {
    struct Swapper {
        /// Curve pool instance
        ICurvePool pool;
        /// The deposit token we want to exchange to/from underlying
        int128 otherTokenIndex;
        /// The underlying used by the vault (presumably always UST)
        int128 underlyingIndex;
    }

    /// token => curve pool (for trading token/underlying)
    mapping(IERC20 => Swapper) public swappers;

    constructor() {
        require(_curvePool != address(0), "curve pool is 0x");
    }

    function addPool(
        address _token,
        ICurvePool _pool,
        int128 _underlyingIndex
    ) public {
        // TODO check if _token and _underlyingIndex match the pool settings
        swappers[_token] = Swapper(_pool, _underlyingIndex);
    }

    /// Indicates what the actual underlying currency is
    function underlying() public view virtual returns (address);

    /// Swaps a given amount of 
    /// Only works if the pool has previously been inserted into the contract
    ///
    /// @param _token The token we want to swap into
    /// @param _amount The amount of underlying we want to swap
    /// TODO missing slippage checks
    function _swapIntoUnderlying(address _token, uint256 _amount) internal {
        address _underlying = underlying();

        if (_token == _underlying) {
            // same token, nothing to do
            return;
        }

        Swapper storage swapper = swappers[_token];

        swapper.pool.exchange_underlying(
            swapper.otherTokenIndex,
            swapper.underlyingIndex,
            _amount
        );
    }

    /// Swaps a given amount of Underlying into a given token
    /// Only works if the pool has previously been inserted into the contract
    ///
    /// @param _token The token we want to swap into
    /// @param _amount The amount of underlying we want to swap
    /// TODO missing slippage checks
    function _swapFromUnderlying(address _token, uint256 _amount) internal {
        address _underlying = underlying();

        if (_token == _underlying) {
            // same token, nothing to do
            return;
        }

        swapper.pool.exchange_underlying(
            swapper.underlyingIndex,
            swapper.otherTokenIndex,
            _amount
        );
    }
}
