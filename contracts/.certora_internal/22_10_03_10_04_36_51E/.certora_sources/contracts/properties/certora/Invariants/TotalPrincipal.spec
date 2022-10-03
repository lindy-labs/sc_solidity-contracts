using MockStrategySync as strategy
using MockERC20 as underlying
using Vault as vault

methods {
    vault.totalPrincipal() returns (uint256) envfree;
}

// declare the ghost function
ghost ghostTotalPrincipal() returns uint256;

hook Sstore vault.deposits[KEY uint256 k].(offset 64) uint256 amount
// the old value ↓ already there
    (uint256 old_amount) STORAGE {
  havoc ghostTotalPrincipal assuming ghostTotalPrincipal@new() == ghostTotalPrincipal@old() +
      (amount - old_amount);
}

rule totalPrincipalPreserved(method f) // For a deposit
{ // total principal must be preserved (sum of depositis amount == sum of claimers of total principal)

  require vault.totalPrincipal() == ghostTotalPrincipal();
  calldataarg arg;
  env e;
  sinvoke f(e, arg);
  assert vault.totalPrincipal() == ghostTotalPrincipal();

}