#!/bin/bash
if [ "$#" -eq 0 ]
then 
  certoraRun certora/harness/LiquityStrategyHarness.sol \
      contracts/Vault.sol \
			certora/harness/MockLUSD.sol \
      contracts/mock/MockERC20.sol:MockLQTY \
			contracts/mock/MockCurveExchange.sol \
      contracts/mock/liquity/MockStabilityPool.sol \
      contracts/mock/liquity/MockLiquityPriceFeed.sol \
	  --link LiquityStrategyHarness:vault=Vault \
      LiquityStrategyHarness:underlying=MockLUSD \
      LiquityStrategyHarness:curveExchange=MockCurveExchange \
      LiquityStrategyHarness:stabilityPool=MockStabilityPool \
      MockStabilityPool:lusd=MockLUSD \
      MockStabilityPool:priceFeed=MockLiquityPriceFeed \
			Vault:underlying=MockLUSD \
      Vault:strategy=LiquityStrategyHarness \
    --verify LiquityStrategyHarness:certora/specs/LiquityStrategy.spec \
    --settings -optimisticFallback=true \
    --optimistic_loop \
    --loop_iter 3 \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --msg "verifying LiquityStrategy"
elif [ "$#" -eq 1 ]
then
  certoraRun certora/harness/LiquityStrategyHarness.sol \
      contracts/Vault.sol \
			certora/harness/MockLUSD.sol \
      contracts/mock/MockERC20.sol:MockLQTY \
			contracts/mock/MockCurveExchange.sol \
      contracts/mock/liquity/MockStabilityPool.sol \
      contracts/mock/liquity/MockLiquityPriceFeed.sol \
	  --link LiquityStrategyHarness:vault=Vault \
      LiquityStrategyHarness:underlying=MockLUSD \
      LiquityStrategyHarness:curveExchange=MockCurveExchange \
      LiquityStrategyHarness:stabilityPool=MockStabilityPool \
      MockStabilityPool:lusd=MockLUSD \
      MockStabilityPool:priceFeed=MockLiquityPriceFeed \
			Vault:underlying=MockLUSD \
      Vault:strategy=LiquityStrategyHarness \
    --verify LiquityStrategyHarness:certora/specs/LiquityStrategy.spec \
    --settings -optimisticFallback=true \
    --optimistic_loop \
    --loop_iter 3 \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --rule "$1" \
    --msg "verifying rule $1 for LiquityStrategy"
else
  echo "You can have only one argument to specify which rule to verify"
fi