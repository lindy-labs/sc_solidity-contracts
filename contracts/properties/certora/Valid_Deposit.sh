certoraRun VaultForCertora.sol ../../Vault.sol ../../mock/MockStrategySync.sol ../../mock/MockERC20.sol \
	--link  VaultForCertora:vault=Vault Vault:strategy=MockStrategySync Vault:underlying=MockERC20 \
	--verify VaultForCertora:Valid_Deposit.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--multi_assert_check \
	--msg "Checking Vault" 
