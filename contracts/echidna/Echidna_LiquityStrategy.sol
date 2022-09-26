// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "./Helper.sol";

contract Echidna_LiquityStrategy is Helper {
    address constant SWAP_TARGET = 0xDef1C0ded9bec7F1a1670819833240f027b25EfF;
    uint256[] depositIds = [0];

    // // invest should revert when not manager
    // function invest_not_manager() public {
    //     try strategy.invest() {
    //         assert(false);
    //     } catch {
    //         assert(true);
    //     }
    // }

    // // harvest should revert if not manager
    // function harvest_not_manager() public {
    //     try strategy.harvest(SWAP_TARGET, [], []) {
    //         assert(false);
    //     } catch {
    //         assert(true);
    //     }
    // }

    // // reinvestRewards should revert if not manager
    // function reinvestRewards_not_manager() public {
    //     try strategy.reinvestRewards(SWAP_TARGET, [], []) {
    //         assert(false);
    //     } catch {
    //         assert(true);
    //     }
    // }

    // // given some vault balance after running updateInvested approx
    // // 90% should be moved to strategy.
    // function updateInvested(uint256 amount) public {
    //     Helper.mint_helper(
    //         address(vault),
    //         12 * 10**18 + Helper.one_to_max_uint64(amount)
    //     );
    //     uint256 balance_vault_before = vault.totalUnderlying();
    //     emit Log("balance of vault before", balance_vault_before);
    //     uint256 balance_strategy_before = underlying.balanceOf(
    //         address(strategy)
    //     );
    //     emit Log("balance of strategy before", balance_strategy_before);

    //     emit Log("strategy.investedAssets()", strategy.investedAssets());

    //     try vault.updateInvested() {
    //         assert(true);
    //     } catch {
    //         assert(false);
    //     }

    //     uint256 balance_vault_after = underlying.balanceOf(address(vault));
    //     emit Log("balance of vault after", balance_vault_after);
    //     uint256 balance_strategy_after = underlying.balanceOf(
    //         address(strategy)
    //     );
    //     emit Log("balance of strategy after", balance_strategy_after);

    //     assert(balance_vault_after * 8 < balance_strategy_after);
    // }

    function rebalancing(uint256 amount, IVault.DepositParams memory _params)
        public
    {
        // mint some funds to this contract
        Helper.mint_helper(
            address(this),
            120 * 10**18 + Helper.one_to_max_uint64(amount)
        );

        uint256 firstDeposit = (underlying.balanceOf(address(this)) * 20) / 100;

        // now deposit that into the strategy
        _params.lockDuration = 2 weeks + (_params.lockDuration % (22 weeks));
        _params.name = "Test Vault";
        _params.amount = firstDeposit;
        _params.inputToken = address(underlying);

        populate_claims(uint16(_params.amount) % 9999, _params.claims);
        // first deposit 20% of the funds
        deposit_should_succeed(_params);

        // _params.amount = underlying.balanceOf(address(this));
        // deposit_should_succeed(_params);

        // // call udpatedInvested() on the vault contract to move 90% of those funds to the strategy contract
        // try vault.updateInvested() {
        //     assert(true);
        // } catch {
        //     assert(false);
        // }

        // // try to withdraw the first Deposit which was 20% of the total funds which is ofcourse greateer than the amount of
        // // funds the vault holds now (which should be around 10%)
        // assert(firstDeposit > underlying.balanceOf(address(vault)));
        // withdraw_should_succeed(address(this), depositIds);

        // assert that it doesn't revert
        // then assert that the vault gets rebalanced to still have 10% of the total funds
    }
}
