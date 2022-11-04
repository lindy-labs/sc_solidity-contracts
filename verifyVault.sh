#!/bin/bash
if [ "$#" -eq 0 ]
then 
  certoraRun certora/harness/VaultHarness.sol \
    --verify VaultHarness:certora/specs/common.spec \
    --optimistic_loop \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --msg "verifying Vault"
elif [ "$#" -eq 1 ]
then
  certoraRun certora/harness/VaultHarness.sol \
    --verify VaultHarness:certora/specs/common.spec \
    --optimistic_loop \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --rule "$1" \
    --msg "verifying rule $1 for Vault"
else
  echo "You can only only one argument to specify which rule to verify"
fi