// // SPDX-License-Identifier: UNLICENSED
// pragma solidity =0.8.10;
// import "./Helper.sol";

// contract Echidna_AnchorStrategy is Helper {

//     // invest should revert when not the manager
//     function invest_not_manager() public {
//         try strategy.invest() {
//             assert(false);
//         } catch {
//             assert(true);
//         }
//     }

//     // finishDepositStable should revert when not the manager
//     function finishDepositStable_not_manager(uint256 idx) public {
//         try strategy.finishDepositStable(idx) {
//             assert(false);
//         } catch {
//             assert(true);
//         }
//     }

//     // initRedeemStable should revert when not the manager
//     function initRedeemStable_not_manager(uint256 ustBalance) public {
//         try strategy.initRedeemStable(ustBalance) {
//             assert(false);
//         } catch {
//             assert(true);
//         }
//     }

//     // given some vault balance after running updateInvested approx
//     // 90% should be moved to strategy.
//     function updateInvested(uint256 amount) public {
//         Helper.mint_helper(address(vault), 12*10**18 + Helper.one_to_max_uint64(amount));
//         uint256 balance_vault_before = vault.totalUnderlying();
//         emit Log("balance of vault before", balance_vault_before);
//         uint256 balance_strategy_before = underlying.balanceOf(address(strategy));
//         emit Log("balance of strategy before", balance_strategy_before);

//         emit Log("strategy.investedAssets()", strategy.investedAssets());

//         try vault.updateInvested() {
//             assert(true);
//         } catch {
//             assert(false);
//         }

//         uint256 balance_vault_after = underlying.balanceOf(address(vault));
//         emit Log("balance of vault after", balance_vault_after);
//         uint256 balance_strategy_after = underlying.balanceOf(address(strategy));
//         emit Log("balance of strategy after", balance_strategy_after);

//         assert(balance_vault_after * 8 < balance_strategy_after);
//     }
// }
