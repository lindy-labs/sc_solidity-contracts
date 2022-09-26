import { BigInt } from '@graphprotocol/graph-ts';

import { Vault } from '../types/schema';

export function createVault(): Vault {
  let vault = Vault.load('0');

  if (vault == null) {
    vault = new Vault('0');
    vault.totalShares = BigInt.fromString('0');
    vault.save();
  }

  return vault;
}
