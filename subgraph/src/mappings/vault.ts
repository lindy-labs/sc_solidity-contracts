import { BigDecimal, BigInt, ByteArray, log } from "@graphprotocol/graph-ts";
import {
  DepositBurned,
  DepositMinted,
  YieldClaimed
} from "../types/templates/Vault/IVault";
import {
  Sponsored,
  Unsponsored
} from "../types/templates/Vault/IVaultSponsoring";
import {
  Sponsor,
  Claimer,
  Deposit,
  Foundation,
  Vault,
  Donation
} from "../types/schema";

export function handleYieldClaimed(event: YieldClaimed): void {
  const claimerId = event.params.claimerId.toString();
  const claimer = Claimer.load(claimerId)!;
  const vault = Vault.load(claimer.vault)!;

  claimer.claimed = claimer.claimed.plus(event.params.amount);
  claimer.shares = claimer.shares.minus(event.params.burnedShares);
  vault.totalShares = vault.totalShares.minus(event.params.burnedShares);
  log.debug("claim, sub shares {}", [event.params.burnedShares.toString()]);

  let totalClaimedShares = new BigInt(0);

  for (let i = 0; i < claimer.depositsIds.length; i++) {
    const deposit = Deposit.load(claimer.depositsIds[i]);

    if (!deposit) continue;

    const claimedShares = deposit.shares
      .times(event.params.amount)
      .div(event.params.burnedShares)
      .minus(deposit.amount)
      .times(event.params.burnedShares)
      .div(event.params.amount);

    totalClaimedShares = totalClaimedShares.plus(claimedShares);
    deposit.shares = deposit.shares.minus(claimedShares);
    deposit.save();

    if (
      event.params.to.equals(
        ByteArray.fromHexString("0x4940c6e628da11ac0bdcf7f82be8579b4696fa33")
      )
    ) {
      const id =
        event.transaction.hash.toHex() +
        "-" +
        event.logIndex.toString() +
        "-" +
        i.toString();

      const donation = new Donation(id);
      donation.txHash = event.transaction.hash;
      donation.amount = claimedShares
        .times(event.params.amount)
        .div(event.params.burnedShares);
      donation.owner = deposit.depositor;
      donation.destination = deposit.data;

      donation.save();
    }
  }

  if (!event.params.burnedShares.equals(totalClaimedShares)) {
    throw "The math for the claimed shares doesn't add up to the total burned shares";
  }

  claimer.save();
  vault.save();
}

export function handleDepositMinted(event: DepositMinted): void {
  const foundationId = event.params.groupId.toString();
  const depositId = event.params.id.toString();
  const claimerId = event.params.claimerId.toString();
  const vaultId = event.address.toString();

  const vault = Vault.load(vaultId)!;
  let claimer = Claimer.load(claimerId);

  if (!claimer) {
    claimer = new Claimer(claimerId);

    claimer.owner = event.params.claimer;
    claimer.claimed = BigInt.fromString("0");
    claimer.depositsIds = [];
  }

  const foundation = new Foundation(foundationId);
  foundation.vault = vaultId;

  claimer.principal = claimer.principal.plus(event.params.amount);
  claimer.shares = claimer.shares.plus(event.params.shares);
  claimer.vault = vaultId;
  claimer.depositsIds = claimer.depositsIds.concat([depositId]);
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
  deposit.data = event.params.data;

  foundation.save();
  claimer.save();
  deposit.save();
  vault.save();
}

var depositId: string;
export function handleDepositBurned(event: DepositBurned): void {
  depositId = event.params.id.toString();

  const deposit = Deposit.load(depositId)!;
  const claimer = Claimer.load(deposit.claimer)!;
  const foundation = Foundation.load(deposit.foundation)!;
  const vault = Vault.load(foundation.vault)!;

  claimer.principal = claimer.principal.minus(deposit.amount);
  claimer.shares = claimer.shares.minus(event.params.shares);
  claimer.depositsIds = claimer.depositsIds.filter(
    (id: string) => id !== depositId
  );

  deposit.burned = true;
  vault.totalShares = vault.totalShares.minus(event.params.shares);
  log.debug("burn, subbing shares {}", [event.params.shares.toString()]);

  claimer.save();
  deposit.save();
  vault.save();
}

export function handleSponsored(event: Sponsored): void {
  const sponsor = new Sponsor(event.params.id.toString());

  sponsor.depositor = event.params.depositor;
  sponsor.amount = event.params.amount;
  sponsor.burned = false;
  sponsor.lockedUntil = event.params.lockedUntil;
  sponsor.save();
}

export function handleUnsponsored(event: Unsponsored): void {
  const sponsorId = event.params.id.toString();
  const sponsor = Sponsor.load(sponsorId)!;

  sponsor.burned = true;
  sponsor.save();
}
