import { BigInt } from "@graphprotocol/graph-ts";

// import { NewVault } from "../types/SandclockFactory/SandclockFactory";
// import { Vault as VaultContract } from "../types/SandclockFactory/Vault";
import { Strategy as StrategyContract } from "../types/Vault/Strategy";

// import { Vault as VaultTemplate } from "../types/templates";
import { Strategy as StrategyTemplate } from "../types/templates";
// import { Claimers as ClaimersTemplate } from "../types/templates";

// import { Vault } from "../types/schema";
// import { Strategy } from "../types/schema";
import { StrategyUpdated } from "../types/Vault/Vault";

export function handleStrategyUpdated(event: StrategyUpdated): void {
  let contract = StrategyContract.bind(event.params.strategy);

  // let record = new Strategy(event.params.strategy.toHexString());

  StrategyTemplate.create(event.params.strategy);
  // ClaimersTemplate.create(contract.claimers());
  // record.save();
}

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
