// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {ICrabNetting} from "../../interfaces/opyn/ICrabNetting.sol";

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockCrabNetting is ICrabNetting {
    mapping(address => uint256) public usdBalances;
    mapping(address => uint256) public crabBalances;

    ERC20 public usdc;
    ERC20 public crab;

    constructor(ERC20 _usdc, ERC20 _crab) {
        usdc = _usdc;
        crab = _crab;
    }

    function depositUSDC(uint256 _amount) external override {
        usdBalances[msg.sender] += _amount;
        usdc.transferFrom(msg.sender, address(this), _amount);
    }

    function withdrawUSDC(uint256 _amount, bool _force) external override {
        require(_force, "MockCrabNetting: !force");

        usdBalances[msg.sender] -= _amount;
        usdc.transfer(msg.sender, _amount);
    }

    function queueCrabForWithdrawal(uint256 _amount) external override {
        crabBalances[msg.sender] += _amount;
        crab.transferFrom(msg.sender, address(this), _amount);
    }

    function dequeueCrab(uint256 _amount, bool _force) external override {
        require(_force, "MockCrabNetting: !force");

        crabBalances[msg.sender] -= _amount;
        crab.transfer(msg.sender, _amount);
    }

    function usdBalance(
        address _account
    ) external view override returns (uint256) {
        return usdBalances[_account];
    }

    function crabBalance(
        address _account
    ) external view override returns (uint256) {
        return crabBalances[_account];
    }

    function depositsQueued() external view override returns (uint256) {}

    function withdrawsQueued() external view override returns (uint256) {}

    function netAtPrice(uint256 _price, uint256 _quantity) external {}

    function otcPriceTolerance() external view override returns (uint256) {}
}
