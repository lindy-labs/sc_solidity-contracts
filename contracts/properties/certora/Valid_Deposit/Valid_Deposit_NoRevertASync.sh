certoraRun ./properties/certora/VaultForCertora.sol Vault.sol mock/MockStrategyAsync.sol mock/MockERC20.sol \
	--link  VaultForCertora:vault=Vault Vault:strategy=MockStrategyAsync Vault:underlying=MockERC20 \
	--verify VaultForCertora:./properties/certora/Valid_Deposit/Valid_Deposit_NoRevertASync.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--packages @openzeppelin=../node_modules/@openzeppelin \
	--multi_assert_check \
	--msg "Checking Vault" 
