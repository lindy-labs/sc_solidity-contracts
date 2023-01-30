// This rule find which functions never reverts.
rule noRevert(method f)
description "$f has reverting paths"
{
	env e;
	calldataarg arg;
	require e.msg.value == 0; 
	f@withrevert(e, arg); 
	assert !lastReverted, "${f.selector} can revert";
}


/*
This rule find which functions always revert.
It's expected that not any function passes the rule.
Any function that passes the rule always revert which indicates a bug in the function.
*/
rule alwaysRevert(method f)
description "$f has reverting paths"
{
	env e;
	calldataarg arg;
	f@withrevert(e, arg); 
	assert lastReverted, "${f.selector} succeeds";
}