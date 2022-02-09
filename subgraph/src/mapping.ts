import { BigInt, store, log, Address } from "@graphprotocol/graph-ts";
import {
  DepositBurned,
  DepositMinted,
  Sponsored,
  Unsponsored
} from "./types/Vault/Vault";
import { YieldClaimed, Transfer } from "./types/Claimers/Claimers";
import { Sponsor, Claimer, Deposit, Foundation } from "./types/schema";

export function handleDepositBurned(event: DepositBurned): void {
  const deposit = Deposit.load(event.params.id.toString());

  if (!deposit) {
    log.critical("Deposit {} does not exist", [event.params.id.toString()]);

    return;
  }

  let claimer = Claimer.load(deposit.claimer);

  if (!claimer) {
    log.critical("Claimer {} does not exist", [deposit.claimer]);

    return;
  }

  claimer.principal = claimer.principal.minus(deposit.amount);
  claimer.shares = claimer.shares.minus(event.params.shares);
  claimer.save();

  store.remove("Deposit", event.params.id.toString());
}

export function handleDepositMinted(event: DepositMinted): void {
  let foundation = new Foundation(event.params.groupId.toString());

  let claimer = Claimer.load(event.params.claimerId.toString());

  if (!claimer) {
    claimer = new Claimer(event.params.claimerId.toString());

    claimer.owner = event.params.claimer;
    claimer.claimed = BigInt.fromString("0");
  }

  claimer.principal = claimer.principal.plus(event.params.amount);
  claimer.shares = claimer.shares.plus(event.params.amount);

  const deposit = new Deposit(event.params.id.toString());

  deposit.amount = event.params.amount;
  deposit.claimer = event.params.claimerId.toString();
  deposit.depositor = event.params.depositor;
  deposit.foundation = event.params.groupId.toString();
  deposit.lockedUntil = event.params.lockedUntil;
  deposit.shares = event.params.shares;

  foundation.save();
  claimer.save();
  deposit.save();
}

export function handleSponsored(event: Sponsored): void {
  const sponsor = new Sponsor(event.params.id.toString());

  sponsor.depositor = event.params.depositor;
  sponsor.amount = event.params.amount;
  sponsor.lockedUntil = event.params.lockedUntil;
  sponsor.save();
}

export function handleUnsponsored(event: Unsponsored): void {
  store.remove("Sponsor", event.params.id.toString());
}
