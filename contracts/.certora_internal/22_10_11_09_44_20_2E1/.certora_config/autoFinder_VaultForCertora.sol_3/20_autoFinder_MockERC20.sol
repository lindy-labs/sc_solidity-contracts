// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

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

    function decimals() public view override(ERC20) returns (uint8) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f90000, 1037618708729) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f90001, 0) }
        return decimals_;
    }

    function updateDecimals(uint8 _decimals) external {
        decimals_ = _decimals;
    }

    function mint(address _user, uint256 _amount) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f80000, 1037618708728) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f80001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f81000, _user) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f81001, _amount) }
        _mint(_user, _amount);
    }

    function burn(address _user, uint256 _amount) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fa0000, 1037618708730) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fa0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fa1000, _user) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fa1001, _amount) }
        _burn(_user, _amount);
    }

    function setFee(uint256 _fee) public {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fb0000, 1037618708731) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fb0001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00fb1000, _fee) }
        fee = _fee;
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20) {assembly { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f70000, 1037618708727) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f70001, 3) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f71000, from) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f71001, to) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00f71002, amount) }
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
    constructor(uint256 supply)
        MockERC20("Mock aUST", "mockaUST", 18, supply)
    {}
}

contract MockLUSD is MockERC20 {
    constructor(uint256 supply)
        MockERC20("Mock LUSD", "mockLUSD", 18, supply)
    {}
}
