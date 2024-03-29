#!/bin/bash
cd ../..
if [ "$#" -eq 0 ]
then 
  certoraRun certora/harness/VaultHarness.sol \
  	  contracts/mock/MockStrategyAsync.sol \
			contracts/mock/MockERC20.sol:MockLUSD \
			contracts/mock/MockCurvePool.sol:MockCurve \
	  --link VaultHarness:strategy=MockStrategyAsync \
      VaultHarness:underlying=MockLUSD \
			MockStrategyAsync:underlying=MockLUSD \
      MockStrategyAsync:vault=VaultHarness \
    --verify VaultHarness:certora/specs/Vault.spec \
    --optimistic_loop \
    --loop_iter 3 \
    --smt_timeout 3600 \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --msg "verifying Vault"
elif [ "$#" -eq 1 ]
then
  certoraRun certora/harness/VaultHarness.sol \
  	  contracts/mock/MockStrategyAsync.sol \
			contracts/mock/MockERC20.sol:MockLUSD \
			contracts/mock/MockCurvePool.sol:MockCurve \
	  --link VaultHarness:strategy=MockStrategyAsync \
      VaultHarness:underlying=MockLUSD \
			MockStrategyAsync:underlying=MockLUSD \
      MockStrategyAsync:vault=VaultHarness \
    --verify VaultHarness:certora/specs/Vault.spec \
    --optimistic_loop \
    --loop_iter 3 \
    --smt_timeout 3600 \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --rule "$1" \
    --msg "verifying rule $1 for Vault"
else
  echo "You can have only one argument to specify which rule to verify"
fi