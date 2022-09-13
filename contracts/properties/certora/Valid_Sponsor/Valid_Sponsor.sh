certoraRun ./properties/certora/SponsorForCertora.sol Vault.sol mock/MockStrategySync.sol mock/MockERC20.sol \
	--link  SponsorForCertora:vault=Vault SponsorForCertora:underlying=MockERC20 Vault:strategy=MockStrategySync Vault:underlying=MockERC20 MockStrategySync:underlying=MockERC20 \
	--verify SponsorForCertora:./properties/certora/Valid_Sponsor/Valid_Sponsor.spec \
	--settings -postProcessCounterExamples=true \
	--optimistic_loop \
	--packages @openzeppelin=../node_modules/@openzeppelin \
	--multi_assert_check \
	--msg "Checking Vault" 
