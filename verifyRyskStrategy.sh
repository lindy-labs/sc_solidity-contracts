#!/bin/bash
if [ "$#" -eq 0 ]
then 
  certoraRun contracts/strategy/rysk/RyskStrategy.sol \
      contracts/Vault.sol \
			certora/harness/MockLUSD.sol \
      contracts/mock/rysk/MockRyskLiquidityPool.sol \
	  --link RyskStrategy:vault=Vault \
      RyskStrategy:underlying=MockLUSD \
      RyskStrategy:ryskLqPool=MockRyskLiquidityPool \
			Vault:underlying=MockLUSD \
      Vault:strategy=RyskStrategy \
      MockRyskLiquidityPool:underlying=MockLUSD \
    --verify RyskStrategy:certora/specs/RyskStrategy.spec \
    --optimistic_loop \
    --loop_iter 3 \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --msg "verifying RyskStrategy"
elif [ "$#" -eq 1 ]
then
  certoraRun contracts/strategy/rysk/RyskStrategy.sol \
      contracts/Vault.sol \
			certora/harness/MockLUSD.sol \
      contracts/mock/rysk/MockRyskLiquidityPool.sol \
	  --link RyskStrategy:vault=Vault \
      RyskStrategy:underlying=MockLUSD \
      RyskStrategy:ryskLqPool=MockRyskLiquidityPool \
			Vault:underlying=MockLUSD \
      Vault:strategy=RyskStrategy \
      MockRyskLiquidityPool:underlying=MockLUSD \
    --verify RyskStrategy:certora/specs/RyskStrategy.spec \
    --optimistic_loop \
    --loop_iter 3 \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --rule "$1" \
    --msg "verifying rule $1 for RyskStrategy"
else
  echo "You can have only one argument to specify which rule to verify"
fi