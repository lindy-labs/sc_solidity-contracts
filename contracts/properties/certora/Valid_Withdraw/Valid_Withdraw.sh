certoraRun VaultCertora.sol \
			./properties/certora/TmpVars.sol \
			mock/MockStrategySync.sol \
			mock/MockERC20.sol \
			mock/MockERC20.sol:MockUST \
			mock/MockCurvePool.sol:MockCurve \
	--link  VaultCertora:strategy=MockStrategySync \
			VaultCertora:underlying=MockUST \
			MockStrategySync:underlying=MockUST \
	--verify VaultCertora:./properties/certora/Valid_Withdraw/Valid_Withdraw.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--multi_assert_check \
	--packages @openzeppelin=../node_modules/@openzeppelin @chainlink=../node_modules/@chainlink \
	--msg "Checking Vault" 
