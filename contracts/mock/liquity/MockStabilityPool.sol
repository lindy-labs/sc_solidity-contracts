// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IStabilityPool} from "../../interfaces/liquity/IStabilityPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockLUSD} from "../MockERC20.sol";

import "hardhat/console.sol";

contract MockStabilityPool is IStabilityPool {
    MockLUSD public immutable lusd;

    event StabilityPoolETHBalanceUpdated(uint256 _newBalance);
    event ETHGainWithdrawn(
        address indexed _depositor,
        uint256 _ETH,
        uint256 _LUSDLoss
    );

    constructor(address _lusd, address _priceFeed) {
        lusd = MockLUSD(_lusd);
        priceFeed = _priceFeed;
    }

    mapping(address => uint256) public balances;

    uint256 public totalDeposits;

    address public priceFeed;

    function provideToSP(
        uint256 _amount,
        address /* _frontEndTag */
    ) external {
        // transfers lusd from the depositor to this contract and updates the balance
        // the balance must appear on getCompoundedLUSDDeposit
        lusd.transferFrom(msg.sender, address(this), _amount);
        balances[msg.sender] += _amount;
        totalDeposits += _amount;
    }

    function withdrawFromSP(uint256 _amount) external {
        // withdraws the LUSD of the user from this contract
        // and updates the balance
        uint256 bal = balances[msg.sender];

        if (_amount > bal) _amount = bal;

        balances[msg.sender] -= _amount;

        lusd.transfer(msg.sender, _amount);

        uint256 ethBal = address(this).balance;

        payable(msg.sender).transfer(ethBal);
        emit ETHGainWithdrawn(msg.sender, ethBal, 0);
    }

    function getDepositorETHGain(
        address /* _depositor */
    ) external view returns (uint256) {
        return address(this).balance;
    }

    function getDepositorLQTYGain(
        address /* _depositor */
    ) external pure returns (uint256) {
        return 0;
    }

    function getCompoundedLUSDDeposit(address _depositor)
        external
        view
        returns (uint256)
    {
        return balances[_depositor];
    }

    function reduceDepositorLUSDBalance(address _depositor, uint256 _amount)
        external
    {
        balances[_depositor] -= _amount;
        lusd.burn(address(this), _amount);
    }

    function offset(uint256 _debtToOffset, uint256 _collToAdd) external {}

    function troveManager() public pure returns (address) {
        return address(0);
    }

    receive() external payable {}
}
