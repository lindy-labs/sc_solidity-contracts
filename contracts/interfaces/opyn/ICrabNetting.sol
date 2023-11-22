// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

interface ICrabNetting {
    function depositUSDC(uint256 _amount) external;

    function withdrawUSDC(uint256 _amount, bool _force) external;

    function queueCrabForWithdrawal(uint256 _amount) external;

    function dequeueCrab(uint256 _amount, bool _force) external;

    /// @dev usd amount to deposit for an address
    function usdBalance(address) external view returns (uint256);

    function crabBalance(address) external view returns (uint256);

    function depositsQueued() external view returns (uint256);

    function withdrawsQueued() external view returns (uint256);

    function netAtPrice(uint256 _price, uint256 _quantity) external;

    function otcPriceTolerance() external view returns (uint256);
}
