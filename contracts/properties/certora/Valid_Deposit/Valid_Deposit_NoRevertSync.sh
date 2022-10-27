certoraRun VaultCertora.sol \
			./properties/certora/TmpVars.sol \
			mock/MockStrategySync.sol \
			mock/MockERC20.sol \
			mock/MockERC20.sol:MockUST \
			mock/MockCurvePoolCertora.sol:MockCurve \
	--link  VaultCertora:strategy=MockStrategySync \
			VaultCertora:underlying=MockUST \
			VaultCertora:bridgeCS=MockCurve \
			MockStrategySync:underlying=MockUST \
			MockCurve:bridgeMCP=MockUST \
	--verify VaultCertora:./properties/certora/Valid_Deposit/Valid_Deposit_NoRevertSync.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--loop_iter 3 \
	--packages @openzeppelin=../node_modules/@openzeppelin @chainlink=../node_modules/@chainlink \
	--msg "Checking Vault" 
