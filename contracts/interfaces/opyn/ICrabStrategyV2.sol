// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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

interface IWETH is IERC20 {
    function deposit() external payable;

    function withdraw(uint256 wad) external;
}

interface ISqueethController {}
