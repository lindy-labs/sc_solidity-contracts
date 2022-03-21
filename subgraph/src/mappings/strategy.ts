import { BigInt } from "@graphprotocol/graph-ts";

import { Strategy as StrategyContract } from "../types/Vault/Strategy";

export function handleInitDeposit(event: Transfer): void {
  // const claimerId = event.params.tokenId.toHexString();
  // const claimer = Claimer.load(claimerId)!;
  // claimer.owner = event.params.to;
  // claimer.save();
}

export function handleInitRedeem(event: Transfer): void {
  // const claimerId = event.params.tokenId.toHexString();
  // const claimer = Claimer.load(claimerId)!;
  // claimer.owner = event.params.to;
  // claimer.save();
}
