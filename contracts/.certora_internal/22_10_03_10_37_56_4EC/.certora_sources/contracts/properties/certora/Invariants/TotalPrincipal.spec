using MockStrategySync as strategy
using MockERC20 as underlying
using Vault as vault

methods {
    vault.totalPrincipal() returns (uint256) envfree;
}

// declare the ghost functions
ghost ghostSumOfAmount() returns uint256;
ghost ghostSumOfClaimers() returns uint256;

hook Sstore vault.deposits[KEY uint256 k].(offset 64) uint256 amount
// the old value ↓ already there
    (uint256 old_amount) STORAGE {
  havoc ghostSumOfAmount assuming ghostSumOfAmount@new() == ghostSumOfAmount@old() +
      (amount - old_amount);
}

hook Sstore vault.claimer[KEY uint256 k].(offset 64) uint256 totalPrincipal
// the old value ↓ already there
    (uint256 old_totalPrincipal) STORAGE {
  havoc ghostSumOfClaimers assuming ghostSumOfClaimers@new() == ghostSumOfClaimers@old() +
      (totalPrincipal - old_totalPrincipal);
}

rule sumOfAmountsPreserved(method f) // For a deposit
{ // total principal must be preserved (sum of depositis amount == sum of claimers of total principal)

  require vault.totalPrincipal() == ghostSumOfAmount();
  calldataarg arg;
  env e;
  sinvoke f(e, arg);
  assert vault.totalPrincipal() == ghostSumOfAmount(), "Total Principal equals the sum of deposits amount";

}

rule totalPrincipalOfClaimersPreserved(method f) // For a deposit
{ // total principal must be preserved (sum of depositis amount == sum of claimers of total principal)

  require vault.totalPrincipal() == ghostSumOfClaimers();
  calldataarg arg;
  env e;
  sinvoke f(e, arg);
  assert vault.totalPrincipal() == ghostSumOfClaimers(), "Total Principal equals the sum of the total principal of claimers";

}