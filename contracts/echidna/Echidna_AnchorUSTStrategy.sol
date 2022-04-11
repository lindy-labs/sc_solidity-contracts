// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";

contract Echidna_AnchorUSTStrategy is Helper {

    // invest should revert when not the manager
    function invest_not_manager(bytes calldata b) public {
        try strategy.invest(b) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    // finishDepositStable should revert when not the manager
    function finishDepositStable_not_manager(uint256 idx) public {
        try strategy.finishDepositStable(idx) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    // initRedeemStable should revert when not the manager
    function initRedeemStable_not_manager(uint256 ustBalance) public {
        try strategy.initRedeemStable(ustBalance) {
            assert(false);
        } catch {
            assert(true);
        }
    }
}
