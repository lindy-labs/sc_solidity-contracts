#!/bin/bash
if [ "$#" -eq 2 ]
then 
  certoraRun $1 \
    --verify $2:certora/specs/common.spec \
    --optimistic_loop \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --msg "verifying $2 contract"
elif [ "$#" -eq 3 ]
then
  certoraRun $1 \
    --verify $2:certora/specs/common.spec \
    --optimistic_loop \
    --packages @openzeppelin=node_modules/@openzeppelin \
    --rule "$3" \
    --msg "verifying rule $3 for $2 contract"
else
  echo "You need to supply 2 or 3 arguments to run the command, e.g., sh runCommon.sh certora/harness/VaultHarness.sol VaultHarness noRevert"
fi 
