import { ethereum, Address, Bytes, BigInt } from '@graphprotocol/graph-ts';

import { Deposit } from '../src/types/schema';

export function newBytes(name: string, value: Bytes): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromBytes(value));
}

export function newI32(name: string, value: i32): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromI32(value));
}

export function newI32FromBigInt(
  name: string,
  value: string,
): ethereum.EventParam {
  return new ethereum.EventParam(
    name,
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString(value)),
  );
}

export function newBool(name: string, value: bool): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromBoolean(value));
}

export function newAddress(name: string, value: string): ethereum.EventParam {
  return new ethereum.EventParam(
    name,
    ethereum.Value.fromAddress(Address.fromString(value)),
  );
}

export function newString(name: string, value: string): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromString(value));
}

export function donationId(event: ethereum.Event, id: string): string {
  return (
    event.transaction.hash.toHex() + '-' + event.logIndex.toString() + '-' + id
  );
}

export function createDeposit(
  id: string,
  amount: i32,
  burned: bool,
  claimer: string,
  foundation: string,
  lockedUntil: i32,
  shares: i32,
): void {
  const deposit = new Deposit(id);
  deposit.amount = BigInt.fromI32(amount);
  deposit.burned = burned;
  deposit.claimer = claimer;
  deposit.foundation = foundation;
  deposit.lockedUntil = BigInt.fromI32(lockedUntil);
  deposit.shares = BigInt.fromI32(shares);
  deposit.save();
}
