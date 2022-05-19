import {
  BigDecimal,
  BigInt,
  ByteArray,
  log,
  Bytes,
} from '@graphprotocol/graph-ts';
import {
  DepositWithdrawn,
  DepositMinted,
  YieldClaimed,
} from '../types/Vault/IVault';
import { TreasuryUpdated } from '../types/Vault/IVaultSettings';
import { Sponsored, Unsponsored } from '../types/Vault/IVaultSponsoring';
import {
  Sponsor,
  Claimer,
  Deposit,
  Foundation,
  Vault,
  Donation,
} from '../types/schema';

export function handleYieldClaimed(event: YieldClaimed): void {
  const claimerId = event.params.claimerId.toHexString();
  const claimer = Claimer.load(claimerId)!;

  createVault(claimer.vault);
  const vault = Vault.load(claimer.vault)!;

  claimer.claimed = claimer.claimed.plus(event.params.amount);
  claimer.shares = claimer.shares.minus(event.params.burnedShares);
  vault.totalShares = vault.totalShares.minus(event.params.burnedShares);
  log.debug('claim, sub shares {}', [event.params.burnedShares.toString()]);

  let totalClaimedShares = new BigInt(0);

  for (let i = 0; i < claimer.depositsIds.length; i++) {
    const deposit = Deposit.load(claimer.depositsIds[i]);

    if (!deposit) continue;

    const claimedAmount = event.params.amount.plus(event.params.perfFee);

    const claimedShares = deposit.shares
      .times(claimedAmount)
      .div(event.params.burnedShares)
      .minus(deposit.amount)
      .times(event.params.burnedShares)
      .div(claimedAmount);

    totalClaimedShares = totalClaimedShares.plus(claimedShares);
    deposit.shares = deposit.shares.minus(claimedShares);
    deposit.save();

    if (
      vault.treasury !== null &&
      event.params.to.toString() == vault.treasury!.toString() &&
      claimedShares.gt(BigInt.fromI32(0))
    ) {
      const id =
        event.transaction.hash.toHex() +
        '-' +
        event.logIndex.toString() +
        '-' +
        i.toString();

      const donation = new Donation(id);
      donation.txHash = event.transaction.hash;
      donation.amount = claimedShares
        .times(event.params.amount)
        .div(event.params.burnedShares);
      donation.owner = deposit.depositor;
      donation.destination = deposit.data;
      donation.minted = false;
      donation.burned = false;

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
  const vaultId = event.address.toHexString();
  const foundationId = vaultId + '-' + event.params.groupId.toString();
  const depositId = event.params.id.toString();
  const claimerId = event.params.claimerId.toHexString();

  createVault(vaultId);
  const vault = Vault.load(vaultId)!;
  vault.totalShares = vault.totalShares.plus(event.params.shares);
  log.debug('mint, adding shares {}', [event.params.shares.toString()]);

  let claimer = Claimer.load(claimerId);

  if (!claimer) {
    claimer = new Claimer(claimerId);
    claimer.owner = event.params.claimer;
    claimer.claimed = BigInt.fromString('0');
    claimer.depositsIds = [];
  }

  claimer.principal = claimer.principal.plus(event.params.amount);
  claimer.shares = claimer.shares.plus(event.params.shares);
  claimer.vault = vaultId;
  claimer.depositsIds = claimer.depositsIds.concat([depositId]);

  let foundation = Foundation.load(foundationId);
  if (foundation == null) {
    foundation = new Foundation(foundationId);

    foundation.vault = vaultId;
    foundation.owner = event.params.depositor;
    foundation.createdAt = event.block.timestamp;
    foundation.lockedUntil = event.params.lockedUntil;
    foundation.amountDeposited = BigInt.fromString('0');
  }

  foundation.name = event.params.name;
  foundation.amountDeposited = foundation.amountDeposited.plus(
    event.params.amount,
  );

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

export function handleTreasuryUpdated(event: TreasuryUpdated): void {
  const vaultId = event.address.toHexString();

  createVault(vaultId);
  const vault = Vault.load(vaultId)!;

  vault.treasury = event.params.treasury;

  vault.save();
}

var depositId: string;
export function handleDepositWithdrawn(event: DepositWithdrawn): void {
  depositId = event.params.id.toString();

  const deposit = Deposit.load(depositId)!;
  const claimer = Claimer.load(deposit.claimer)!;
  const foundation = Foundation.load(deposit.foundation)!;

  createVault(foundation.vault);
  const vault = Vault.load(foundation.vault)!;

  claimer.principal = claimer.principal.minus(deposit.amount);
  claimer.shares = claimer.shares.minus(event.params.shares);
  claimer.depositsIds = claimer.depositsIds.filter(
    (id: string) => id !== depositId,
  );

  deposit.burned = true;
  vault.totalShares = vault.totalShares.minus(event.params.shares);
  log.debug('burn, subbing shares {}', [event.params.shares.toString()]);

  foundation.amountDeposited = foundation.amountDeposited.minus(deposit.amount);

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

function createVault(id: string): void {
  let vault = Vault.load(id);

  if (vault == null) {
    vault = new Vault(id);
    vault.totalShares = BigInt.fromString('0');
    vault.save();
  }
}
