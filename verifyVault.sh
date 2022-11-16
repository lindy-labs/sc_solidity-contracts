#!/bin/bash
if [ "$#" -eq 0 ]
then 
  certoraRun certora/harness/VaultHarness.sol \
  	  contracts/mock/MockStrategySync.sol \
			contracts/mock/MockERC20.sol:MockLUSD \
			contracts/mock/MockCurvePool.sol:MockCurve \
	  --link VaultHarness:strategy=MockStrategySync \
      VaultHarness:underlying=MockLUSD \
			MockStrategySync:underlying=MockLUSD \
    --verify VaultHarness:certora/specs/Vault.spec \
    --optimistic_loop \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --msg "verifying Vault"
elif [ "$#" -eq 1 ]
then
  certoraRun certora/harness/VaultHarness.sol \
  	  contracts/mock/MockStrategySync.sol \
			contracts/mock/MockERC20.sol:MockLUSD \
			contracts/mock/MockCurvePool.sol:MockCurve \
	  --link VaultHarness:strategy=MockStrategySync \
      VaultHarness:underlying=MockLUSD \
			MockStrategySync:underlying=MockLUSD \
    --verify VaultHarness:certora/specs/Vault.spec \
    --optimistic_loop \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --rule "$1" \
    --msg "verifying rule $1 for Vault"
else
  echo "You can have only one argument to specify which rule to verify"
fi