// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20("MockERC20", "ME2") {
    uint8 private decimals_;

    constructor(uint256 _totalSupply) {
        decimals_ = 18;
        _mint(msg.sender, _totalSupply);
    }

    function decimals() public view override returns (uint8) {
        return decimals_;
    }

    function updateDecimals(uint8 _decimals) external {
        decimals_ = _decimals;
    }

    function mint(address _user, uint256 _amount) public {
        _mint(_user, _amount);
    }
}
