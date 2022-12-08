#!/bin/bash
if [ "$#" -eq 0 ]
then 
  certoraRun contracts/strategy/liquity/LiquityStrategy.sol \
      contracts/Vault.sol \
			contracts/mock/MockERC20.sol:MockLUSD \
      contracts/mock/MockERC20.sol:MockLQTY \
			contracts/mock/MockCurveExchange.sol \
      contracts/mock/liquity/MockStabilityPool.sol \
      contracts/mock/liquity/MockLiquityPriceFeed.sol \
	  --link LiquityStrategy:vault=Vault \
      LiquityStrategy:underlying=MockLUSD \
      LiquityStrategy:curveExchange=MockCurveExchange \
      LiquityStrategy:stabilityPool=MockStabilityPool \
      MockStabilityPool:lusd=MockLUSD \
      MockStabilityPool:priceFeed=MockLiquityPriceFeed \
			Vault:underlying=MockLUSD \
      Vault:strategy=LiquityStrategy \
    --verify LiquityStrategy:certora/specs/LiquityStrategy.spec \
    --optimistic_loop \
    --loop_iter 3 \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --msg "verifying LiquityStrategy"
elif [ "$#" -eq 1 ]
then
  certoraRun contracts/strategy/liquity/LiquityStrategy.sol \
      contracts/Vault.sol \
			contracts/mock/MockERC20.sol:MockLUSD \
      contracts/mock/MockERC20.sol:MockLQTY \
			contracts/mock/MockCurveExchange.sol \
      contracts/mock/liquity/MockStabilityPool.sol \
      contracts/mock/liquity/MockLiquityPriceFeed.sol \
	  --link LiquityStrategy:vault=Vault \
      LiquityStrategy:underlying=MockLUSD \
      LiquityStrategy:curveExchange=MockCurveExchange \
      LiquityStrategy:stabilityPool=MockStabilityPool \
      MockStabilityPool:lusd=MockLUSD \
      MockStabilityPool:priceFeed=MockLiquityPriceFeed \
			Vault:underlying=MockLUSD \
      Vault:strategy=LiquityStrategy \
    --verify LiquityStrategy:certora/specs/LiquityStrategy.spec \
    --optimistic_loop \
    --loop_iter 3 \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --rule "$1" \
    --msg "verifying rule $1 for LiquityStrategy"
else
  echo "You can have only one argument to specify which rule to verify"
fi