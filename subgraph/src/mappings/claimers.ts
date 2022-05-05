import { Address } from '@graphprotocol/graph-ts';

import { log } from '@graphprotocol/graph-ts';
import { Transfer } from '../types/templates/Claimers/IERC721';

import { Claimer, Vault } from '../types/schema';

export function handleClaimerTransfer(event: Transfer): void {
  if (event.params.from == Address.zero()) {
    return;
  }

  const claimerId = event.params.tokenId.toHexString();

  const claimer = Claimer.load(claimerId)!;
  claimer.owner = event.params.to;
  claimer.save();
}
