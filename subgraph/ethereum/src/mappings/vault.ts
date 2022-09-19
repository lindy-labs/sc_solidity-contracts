import { BigInt, log } from '@graphprotocol/graph-ts';
import {
  DepositWithdrawn,
  DepositMinted,
  YieldClaimed,
} from '../types/Vault/IVault';
import {
  TreasuryUpdated,
  StrategyUpdated,
} from '../types/Vault/IVaultSettings';
import { Sponsored, Unsponsored } from '../types/Vault/IVaultSponsoring';
import {
  Sponsor,
  Claimer,
  Deposit,
  Foundation,
  Vault,
  Donation,
} from '../types/schema';

export function handleStrategyUpdated(event: StrategyUpdated): void {
  const vault = createVault();

  vault.strategy = event.params.strategy;
  vault.save();
}

export function handleYieldClaimed(event: YieldClaimed): void {
  const claimerId = event.params.claimerId.toHexString();
  const claimer = Claimer.load(claimerId)!;

  const vault = createVault();

  claimer.claimed = claimer.claimed.plus(event.params.amount);
  claimer.shares = claimer.shares.minus(event.params.burnedShares);
  vault.totalShares = vault.totalShares.minus(event.params.burnedShares);
  log.debug('claim, sub shares {}', [event.params.burnedShares.toString()]);

  let totalClaimedShares = new BigInt(0);

  for (let i = 0; i < claimer.depositsIds.length; i++) {
    const deposit = Deposit.load(claimer.depositsIds[i]);

    if (!deposit) continue;

    const foundation = Foundation.load(deposit.foundation);

    if (!foundation) continue;

    // The deposit's claimed amount it the same as the deposit's yield.
    // Which is the difference between the deposit's amount and what its shares are worth right now.
    const depositClaimedAmount = deposit.shares
      .times(event.params.totalUnderlying)
      .div(event.params.totalShares)
      .minus(deposit.amount);

    const depositClaimedShares = depositClaimedAmount
      .times(event.params.totalShares)
      .div(event.params.totalUnderlying);

    totalClaimedShares = totalClaimedShares.plus(depositClaimedShares);

    deposit.shares = deposit.shares.minus(depositClaimedShares);
    deposit.save();

    foundation.shares = foundation.shares.minus(depositClaimedShares);
    foundation.amountClaimed = foundation.amountClaimed.plus(
      depositClaimedAmount,
    );
    foundation.save();

    // If the claim is to the treasury, create a Donation
    if (
      vault.treasury !== null &&
      event.params.to.toString() == vault.treasury!.toString() &&
      depositClaimedShares.gt(BigInt.fromI32(0))
    ) {
      const id =
        event.transaction.hash.toHex() +
        '-' +
        event.logIndex.toString() +
        '-' +
        i.toString();

      const donation = new Donation(id);
      donation.txHash = event.transaction.hash;
      donation.amount = depositClaimedShares
        .times(event.params.amount)
        .div(event.params.burnedShares);
      donation.owner = deposit.depositor;
      donation.destination = deposit.data;
      donation.vault = claimer.vault;

      donation.save();
    }
  }

  claimer.save();
  vault.save();
}

export function handleDepositMinted(event: DepositMinted): void {
  const vaultId = '0';
  const foundationId = vaultId + '-' + event.params.groupId.toString();
  const depositId = event.params.id.toString();
  const claimerId = event.params.claimerId.toHexString();

  const vault = createVault();
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
    foundation.amountDeposited = BigInt.fromString('0');
    foundation.shares = BigInt.fromString('0');
    foundation.amountClaimed = BigInt.fromString('0');
  }

  foundation.lockedUntil = event.params.lockedUntil;
  foundation.shares = foundation.shares.plus(event.params.shares);
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
  deposit.vault = vaultId;

  foundation.save();
  claimer.save();
  deposit.save();
  vault.save();
}

export function handleTreasuryUpdated(event: TreasuryUpdated): void {
  const vaultId = '0';

  const vault = createVault();

  vault.treasury = event.params.treasury;

  vault.save();
}

var depositId: string;
export function handleDepositWithdrawn(event: DepositWithdrawn): void {
  depositId = event.params.id.toString();

  const deposit = Deposit.load(depositId)!;
  const claimer = Claimer.load(deposit.claimer)!;
  const foundation = Foundation.load(deposit.foundation)!;

  const vault = createVault();

  claimer.principal = claimer.principal.minus(deposit.amount);
  claimer.shares = claimer.shares.minus(event.params.shares);

  if (event.params.burned) {
    claimer.depositsIds = claimer.depositsIds.filter(
      (id: string) => id !== depositId,
    );

    deposit.burned = true;
  }

  deposit.amount = deposit.amount.minus(event.params.amount);
  deposit.shares = deposit.shares.minus(event.params.shares);

  vault.totalShares = vault.totalShares.minus(event.params.shares);
  log.debug('subbing shares {}', [event.params.shares.toString()]);

  foundation.amountDeposited = foundation.amountDeposited.minus(
    event.params.amount,
  );
  foundation.shares = foundation.shares.minus(event.params.shares);

  claimer.save();
  foundation.save();
  deposit.save();
  vault.save();
}

export function handleSponsored(event: Sponsored): void {
  const sponsor = new Sponsor(event.params.id.toString());

  sponsor.depositor = event.params.depositor;
  sponsor.amount = event.params.amount;
  sponsor.burned = false;
  sponsor.lockedUntil = event.params.lockedUntil;
  sponsor.vault = '0';
  sponsor.save();
}

export function handleUnsponsored(event: Unsponsored): void {
  const sponsorId = event.params.id.toString();
  const sponsor = Sponsor.load(sponsorId)!;

  if (event.params.burned) {
    sponsor.burned = true;
  } else {
    sponsor.amount = sponsor.amount.minus(event.params.amount);
  }

  sponsor.save();
}

function createVault(): Vault {
  let vault = Vault.load('0');

  if (vault == null) {
    vault = new Vault('0');
    vault.totalShares = BigInt.fromString('0');
    vault.save();
  }

  return vault;
}
