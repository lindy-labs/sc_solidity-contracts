// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import {IStabilityPool} from "../../interfaces/liquity/IStabilityPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockStabilityPool is IStabilityPool {
    IERC20 public constant lusd =
        IERC20(0x5f98805A4E8be255a32880FDeC7F6728C6568bA0);

    mapping(address => uint256) public balances;

    function provideToSP(uint256 _amount, address _frontEndTag) external {
        // transfers lusd from the depositor to this contract and updates the balance
        // the balance must appear on getCompoundedLUSDDeposit
        lusd.transferFrom(msg.sender, address(this), _amount);
        balances[msg.sender] += _amount;
    }

    function withdrawFromSP(uint256 _amount) external {
        // withdraws the LUSD of the user from this contract
        // and updates the balance
        uint256 bal = balances[msg.sender];

        if (_amount > bal) _amount = bal;

        lusd.transfer(msg.sendre, _amount);
    }

    function getDepositorETHGain(address _depositor)
        external
        view
        returns (uint256)
    {
        return 0;
    }

    function getDepositorLQTYGain(address _depositor)
        external
        view
        returns (uint256)
    {
        return 0;
    }

    function getCompoundedLUSDDeposit(address _depositor)
        external
        view
        returns (uint256)
    {
        return balances[_depositor];
    }
}
