// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {IWETH} from "../interfaces/opyn/ICrabStrategyV2.sol";

contract MockERC20 is ERC20 {
    uint8 private decimals_;

    uint256 private fee;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _totalSupply
    ) ERC20(_name, _symbol) {
        fee = 0;
        decimals_ = _decimals;
        _mint(msg.sender, _totalSupply);
    }

    function decimals() public view override(ERC20) returns (uint8) {
        return decimals_;
    }

    function updateDecimals(uint8 _decimals) external {
        decimals_ = _decimals;
    }

    function mint(address _user, uint256 _amount) public {
        _mint(_user, _amount);
    }

    function burn(address _user, uint256 _amount) public {
        _burn(_user, _amount);
    }

    function setFee(uint256 _fee) public {
        fee = _fee;
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20) {
        super._transfer(from, to, (amount * (10000 - fee)) / 10000);
    }
}

contract MockDAI is MockERC20 {
    constructor(uint256 supply) MockERC20("Mock DAI", "mockDAI", 18, supply) {}
}

contract MockUSDC is MockERC20 {
    constructor(uint256 supply) MockERC20("Mock USDC", "mockUSDC", 6, supply) {}
}

contract MockUST is MockERC20 {
    constructor(uint256 supply) MockERC20("Mock UST", "mockUST", 18, supply) {}
}

contract MockAUST is MockERC20 {
    constructor(
        uint256 supply
    ) MockERC20("Mock aUST", "mockaUST", 18, supply) {}
}

contract MockLUSD is MockERC20 {
    constructor(
        uint256 supply
    ) MockERC20("Mock LUSD", "mockLUSD", 18, supply) {}
}

contract MockLQTY is MockERC20 {
    constructor(
        uint256 supply
    ) MockERC20("Mock LQTY", "mockLQTY", 18, supply) {}
}

contract MockOSQTH is MockERC20 {
    constructor(
        uint256 supply
    ) MockERC20("Mock oSQTH", "mockOSQTH", 18, supply) {}
}

contract MockWETH is MockERC20, IWETH {
    constructor(
        uint256 supply
    ) MockERC20("Mock WETH", "mockWETH", 18, supply) {}

    function deposit() external payable override {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 wad) external override {
        _burn(msg.sender, wad);

        require(address(this).balance >= wad, "MockWETH: insufficient balance");

        payable(msg.sender).transfer(wad);
    }
}
