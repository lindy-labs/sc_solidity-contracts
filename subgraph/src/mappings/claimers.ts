import { Address } from "@graphprotocol/graph-ts";

import { log } from "@graphprotocol/graph-ts";
import { YieldClaimed } from "../types/templates/Claimers/IClaimers";
import { Transfer } from "../types/templates/Claimers/IERC721";

import { Claimer, Vault } from "../types/schema";

export function handleYieldClaimed(event: YieldClaimed): void {
  const claimerId = event.params.claimerId.toHexString();
  const claimer = Claimer.load(claimerId)!;
  const vault = Vault.load(claimer.vault)!;

  claimer.claimed = claimer.claimed.plus(event.params.amount);
  claimer.shares = claimer.shares.minus(event.params.burnedShares);
  vault.totalShares = vault.totalShares.minus(event.params.burnedShares);
  log.debug("claim, sub shares {}", [event.params.burnedShares.toString()]);

  claimer.save();
  vault.save();
}

export function handleClaimerTransfer(event: Transfer): void {
  if (event.params.from == Address.zero()) {
    return;
  }

  const claimerId = event.params.tokenId.toHexString();

  const claimer = Claimer.load(claimerId)!;
  claimer.owner = event.params.to;
  claimer.save();
}
