certoraRun Vault.sol ./properties/certora/TmpVars.sol \
	mock/MockStrategySync.sol mock/MockERC20.sol mock/MockERC20.sol:MockUST mock/MockCurvePool.sol:MockCurve \
	mock/anchor/MockAnchorStrategy.sol \
	../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol \
	--link  Vault:strategy=MockStrategySync Vault:underlying=MockUST MockStrategySync:underlying=MockUST MockAnchorStrategy:underlying=MockUST \
	--verify Vault:./properties/certora/Valid_Deposit/Valid_Deposit_NoRevertSync.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--packages @openzeppelin=../node_modules/@openzeppelin @chainlink=../node_modules/@chainlink \
	--msg "Checking Vault" 
