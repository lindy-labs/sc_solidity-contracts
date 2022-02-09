import { BigInt } from "@graphprotocol/graph-ts";

import { NewVault } from "../types/SandclockFactory/SandclockFactory";
import { Vault as VaultContract } from "../types/SandclockFactory/Vault";

import { Vault as VaultTemplate } from "../types/templates";
import { Claimers as ClaimersTemplate } from "../types/templates";

import { Vault } from "../types/schema";

export function handleNewVault(event: NewVault): void {
  let contract = VaultContract.bind(event.params.vault);

  let record = new Vault(event.params.vault.toHexString());
  record.underlying = contract.underlying();
  record.totalShares = BigInt.fromString("0");

  VaultTemplate.create(event.params.vault);
  ClaimersTemplate.create(contract.claimers());
  record.save();
}
