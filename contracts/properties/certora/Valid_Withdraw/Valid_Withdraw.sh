certoraRun ./properties/certora/VaultForCertora.sol Vault.sol mock/MockStrategySync.sol mock/MockERC20.sol \
	--link  VaultForCertora:vault=Vault VaultForCertora:underlying=MockERC20 Vault:strategy=MockStrategySync Vault:underlying=MockERC20 MockStrategySync:underlying=MockERC20 \
	--verify VaultForCertora:./properties/certora/Valid_Withdraw/Valid_Withdraw.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--packages @openzeppelin=../node_modules/@openzeppelin \
	--multi_assert_check \
	--msg "Checking Vault" 
