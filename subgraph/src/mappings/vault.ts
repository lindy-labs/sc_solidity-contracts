import { BigInt, log } from "@graphprotocol/graph-ts";
import { DepositBurned, DepositMinted } from "../types/templates/Vault/IVault";
import {
  Sponsored,
  Unsponsored
} from "../types/templates/Vault/IVaultSponsoring";
import { Sponsor, Claimer, Deposit, Foundation, Vault } from "../types/schema";

export function handleDepositMinted(event: DepositMinted): void {
  const foundationId = event.params.groupId.toHexString();
  const depositId = event.params.id.toHexString();
  const claimerId = event.params.claimerId.toHexString();
  const vaultId = event.address.toHexString();

  const vault = Vault.load(vaultId)!;
  let claimer = Claimer.load(claimerId);

  if (!claimer) {
    claimer = new Claimer(claimerId);

    claimer.owner = event.params.claimer;
    claimer.claimed = BigInt.fromString("0");
  }

  const foundation = new Foundation(foundationId);
  foundation.vault = vaultId;

  claimer.principal = claimer.principal.plus(event.params.amount);
  claimer.shares = claimer.shares.plus(event.params.shares);
  claimer.vault = vaultId;
  vault.totalShares = vault.totalShares.plus(event.params.shares);
  log.debug("mint, adding shares {}", [event.params.shares.toString()]);

  const deposit = new Deposit(depositId);

  deposit.amount = event.params.amount;
  deposit.claimer = claimerId;
  deposit.depositor = event.params.depositor;
  deposit.foundation = foundationId;
  deposit.lockedUntil = event.params.lockedUntil;
  deposit.shares = event.params.shares;
  deposit.burned = false;

  foundation.save();
  claimer.save();
  deposit.save();
  vault.save();
}

export function handleDepositBurned(event: DepositBurned): void {
  const depositId = event.params.id.toHexString();

  const deposit = Deposit.load(depositId)!;
  const claimer = Claimer.load(deposit.claimer)!;
  const foundation = Foundation.load(deposit.foundation)!;
  const vault = Vault.load(foundation.vault)!;

  claimer.principal = claimer.principal.minus(deposit.amount);
  claimer.shares = claimer.shares.minus(event.params.shares);
  deposit.burned = true;
  vault.totalShares = vault.totalShares.minus(event.params.shares);
  log.debug("burn, subbing shares {}", [event.params.shares.toString()]);

  claimer.save();
  deposit.save();
  vault.save();
}

export function handleSponsored(event: Sponsored): void {
  const sponsor = new Sponsor(event.params.id.toHexString());

  sponsor.depositor = event.params.depositor;
  sponsor.amount = event.params.amount;
  sponsor.burned = false;
  sponsor.lockedUntil = event.params.lockedUntil;
  sponsor.save();
}

export function handleUnsponsored(event: Unsponsored): void {
  const sponsorId = event.params.id.toHexString();
  const sponsor = Sponsor.load(sponsorId)!;

  sponsor.burned = true;
  sponsor.save();
}
