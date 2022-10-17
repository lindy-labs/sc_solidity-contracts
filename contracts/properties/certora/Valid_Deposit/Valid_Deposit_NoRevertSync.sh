certoraRun Vault.sol mock/MockStrategySync.sol mock/MockERC20.sol mock/MockERC20.sol:MockUST mock/anchor/MockAnchorStrategy.sol mock/MockCurvePool.sol:MockCurve \
	--link  Vault:strategy=MockStrategySync Vault:underlying=MockERC20 MockStrategySync:underlying=MockERC20 MockAnchorStrategy:underlying=MockUST \
	--verify Vault:./properties/certora/Valid_Deposit/Valid_Deposit_NoRevertSync.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--packages @openzeppelin=../node_modules/@openzeppelin @chainlink=../node_modules/@chainlink \
	--msg "Checking Vault" 
