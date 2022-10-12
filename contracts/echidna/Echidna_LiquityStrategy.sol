// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

import "./Helper.sol";

contract Echidna_LiquityStrategy is Helper {
    address constant SWAP_TARGET = 0xDef1C0ded9bec7F1a1670819833240f027b25EfF;

    // role allowed to invest/withdraw assets to/from the strategy (vault)
    bytes32 internal constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    // role allowed to call harvest() and reinvest()
    bytes32 internal constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    // role for managing swap targets whitelist
    bytes32 internal constant SETTINGS_ROLE = keccak256("SETTINGS_ROLE");

    // reverts if msg.sender is not manager
    function invest_not_manager() public {
	strategy.revokeRole(MANAGER_ROLE, address(this));
        try strategy.invest() {
            assert(false);
        } catch {
            assert(true);
        }
    }

    // reverts if underlying balance is zero
    function invest_underlying_zero() public {
	require(address(this) == 0x5409ED021D9299bf6814279A6A1411A7e866A631);
	require(vault.totalUnderlying() == 0);
	strategy.grantRole(MANAGER_ROLE, 0x5409ED021D9299bf6814279A6A1411A7e866A631);
        try strategy.invest() {
            assert(false);
        } catch {
            assert(true);
        }
    }

    // deposits underlying to the stabilityPool
    function invest_moves_balance_to_stabilitypool(uint256 _amount) public {
	require(address(this) == 0x5409ED021D9299bf6814279A6A1411A7e866A631);
	uint256 amount = one_to_max_uint64(_amount);
	underlying.mint(address(strategy), amount);
	strategy.grantRole(MANAGER_ROLE, 0x5409ED021D9299bf6814279A6A1411A7e866A631);
	uint256 before = underlying.balanceOf(address(stabilityPool));
        try strategy.invest() {
            assert(true);
        } catch {
            assert(false);
        }
	assert(underlying.balanceOf(address(strategy)) == 0);
	assert(underlying.balanceOf(address(stabilityPool)) == amount + before);
    }

    // reverts if msg.sender is not manager
    function withdrawToVault_not_manager() public {
	strategy.revokeRole(MANAGER_ROLE, address(this));
        try strategy.withdrawToVault(1) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    // reverts if amount is zero
    function withdrawToVault_underlying_zero() public {
	require(address(this) == 0x5409ED021D9299bf6814279A6A1411A7e866A631);
	strategy.grantRole(MANAGER_ROLE, address(this));
        try strategy.withdrawToVault(0) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    // reverts if amount is greater than invested assets
    function withdrawToVault_more_than_invested(uint256 _amount) public {
	require(address(this) == 0x5409ED021D9299bf6814279A6A1411A7e866A631);
	uint256 amount = strategy.investedAssets() + one_to_max_uint64(_amount);
	strategy.grantRole(MANAGER_ROLE, address(this));
        try strategy.withdrawToVault(amount) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    // works if amount is less than invested assets
    function withdrawToVault_less_than_invested(uint256 _amount) public {
	require(address(this) == 0x5409ED021D9299bf6814279A6A1411A7e866A631);
	uint256 before_invested = strategy.investedAssets();
	emit Log("strategy.investedAssets()", strategy.investedAssets());
	require(before_invested != 0);
	uint256 amount = 1 + one_to_max_uint64(_amount) % before_invested;
	uint256 before_vault = underlying.balanceOf(address(vault));
	strategy.grantRole(MANAGER_ROLE, address(this));
        try strategy.withdrawToVault(amount) {
            assert(true);
        } catch {
            assert(false);
        }
	assert(strategy.investedAssets() == before_invested - amount);
	assert(underlying.balanceOf(address(vault)) == before_vault + amount);
    }

    // works if amount is equal than invested assets
    function withdrawToVault_equal_invested() public {
	require(address(this) == 0x5409ED021D9299bf6814279A6A1411A7e866A631);
	emit Log("strategy.investedAssets()", strategy.investedAssets());
	require(strategy.investedAssets() != 0);
	uint256 amount = strategy.investedAssets();
	uint256 before_vault = underlying.balanceOf(address(vault));
	strategy.grantRole(MANAGER_ROLE, address(this));
        try strategy.withdrawToVault(amount) {
            assert(true);
        } catch {
            assert(false);
        }
	assert(strategy.investedAssets() == 0);
	assert(underlying.balanceOf(address(vault)) == before_vault + amount);
    }

    // reverts if msg.sender is not settings role
    function allowSwapTarget_not_settings(address _swapTarget) public {
	strategy.revokeRole(SETTINGS_ROLE, address(this));
        try strategy.allowSwapTarget(_swapTarget) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    // reverts if msg.sender is not settings role
    function denySwapTarget_not_settings(address _swapTarget) public {
	strategy.revokeRole(SETTINGS_ROLE, address(this));
        try strategy.denySwapTarget(_swapTarget) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    // reverts if msg.sender is not keeper role
    function reinvest_not_keeper(address _swapTarget, uint256 _lqtyAmount, bytes calldata _lqtySwapData, uint256 _ethAmount, bytes calldata _ethSwapData, uint256 _amountOutMin) public {
	strategy.revokeRole(KEEPER_ROLE, address(this));
        try strategy.reinvest(_swapTarget, _lqtyAmount, _lqtySwapData, _ethAmount, _ethSwapData, _amountOutMin) {
            assert(false);
        } catch {
            assert(true);
        }
    }
}
