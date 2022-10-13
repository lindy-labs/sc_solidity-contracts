certoraRun ./properties/certora/VaultForCertora.sol Vault.sol mock/MockStrategySync.sol mock/MockERC20.sol \
	--link  VaultForCertora:vault=Vault Vault:strategy=MockStrategySync Vault:underlying=MockERC20 \
	--verify VaultForCertora:./properties/certora/Valid_Deposit/Valid_Deposit_NoRevertSync.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--packages @openzeppelin=../node_modules/@openzeppelin \
	--msg "Checking Vault" 
