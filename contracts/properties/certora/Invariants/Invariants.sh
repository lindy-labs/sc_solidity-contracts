certoraRun Vault.sol \
	--verify Vault:./properties/certora/Invariants/Invariants.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--packages @openzeppelin=../node_modules/@openzeppelin \
	--multi_assert_check \
	--msg "Checking Vault" 
