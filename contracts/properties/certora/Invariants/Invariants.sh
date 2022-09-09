certoraRun ./properties/certora/VaultDepositWithdraw.sol Vault.sol mock/MockStrategySync.sol mock/MockERC20.sol  \
	--link  VaultDepositWithdraw:vault=Vault Vault:strategy=MockStrategySync Vault:underlying=MockERC20 MockStrategySync:underlying=MockERC20 \
	--verify VaultDepositWithdraw:./properties/certora/Invariants/Invariants.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--packages @openzeppelin=../node_modules/@openzeppelin \
	--multi_assert_check \
	--msg "Checking Vault" 
