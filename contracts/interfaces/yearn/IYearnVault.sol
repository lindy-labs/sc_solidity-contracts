// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IYearnVault is IERC20Metadata {
    function deposit(uint256 amount, address recipient)
        external
        returns (uint256);

    function pricePerShare() external view returns (uint256);

    function withdraw(
        uint256 maxShares,
        address recipient,
        uint256 maxLoss
    ) external returns (uint256);

    function totalAssets() external view returns (uint256);
}
