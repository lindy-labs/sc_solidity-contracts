certoraRun ./properties/certora/VaultForCertora.sol Vault.sol mock/MockERC20.sol \
	--link  VaultForCertora:vault=Vault Vault:underlying=MockERC20 \
	--verify VaultForCertora:./properties/certora/Invalid_Deposit/Invalid_Deposit.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--packages @openzeppelin=../node_modules/@openzeppelin \
	--multi_assert_check \
	--msg "Checking Vault" 
