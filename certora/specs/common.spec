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


/*
This rule find which functions that can be called, may fail due to someone else calling it right before.
This is an expensive rule - might timeout on big contracts
*/
rule simpleFrontRunning(method f, address privileged) filtered { f-> !f.isView }
description "$f can no longer be called after it had been called by someone else"
{
	env e1;
	calldataarg arg;
	require e1.msg.sender == privileged;  

	storage initialStorage = lastStorage;
	f(e1, arg); 
	bool firstSucceeded = !lastReverted;

	env e2;
	calldataarg arg2;
	require e2.msg.sender != e1.msg.sender;
	f(e2, arg2) at initialStorage; 
	f@withrevert(e1, arg);
	bool succeeded = !lastReverted;

	assert succeeded, "${f.selector} can be not be called if was called by someone else";
}