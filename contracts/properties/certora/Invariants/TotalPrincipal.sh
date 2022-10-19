certoraRun ./properties/certora/VaultDeposit.sol Vault.sol mock/MockStrategySync.sol mock/MockERC20.sol  \
	--link  VaultDeposit:vault=Vault Vault:strategy=MockStrategySync Vault:underlying=MockERC20 MockStrategySync:underlying=MockERC20 \
	--verify VaultDeposit:./properties/certora/Invariants/TotalPrincipal.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--packages @openzeppelin=../node_modules/@openzeppelin \
	--multi_assert_check \
	--msg "Checking Vault" 
