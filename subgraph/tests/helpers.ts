import { ethereum, Address, Bytes, BigInt } from '@graphprotocol/graph-ts';
import { createMockedFunction, newMockEvent } from 'matchstick-as';

import { Deposit } from '../src/types/schema';

export const MOCK_ADDRESS_1 =
  '0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd'.toLowerCase();
export const MOCK_ADDRESS_2 =
  '0xE80B3caAd6d2DE80Ac76a41d5F0072E36D2519Ce'.toLowerCase();
export const TREASURY_ADDRESS = '0x4940c6e628da11ac0bdcf7f82be8579b4696fa33';

export const STRATEGY_ADDRESS =
  '0xc90b3caad6d2de80ac76a41d5f0072e36d2519cd'.toLowerCase();
export const STABILITY_POOL_ADDRESS =
  '0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd'.toLowerCase();
export const PRICE_FEED_ADDRESS =
  '0xE80B3caAd6d2DE80Ac76a41d5F0072E36D2519Ce'.toLowerCase();

export function mockLastGoodPrice(value: string): void {
  createMockedFunction(
    Address.fromString(PRICE_FEED_ADDRESS),
    'lastGoodPrice',
    'lastGoodPrice():(uint256)',
  )
    .withArgs([])
    .returns([newValueI32FromBigInt(value)]);
}

export function mockGetDepositorETHGain(value: string): void {
  createMockedFunction(
    Address.fromString(STABILITY_POOL_ADDRESS),
    'getDepositorETHGain',
    'getDepositorETHGain(address):(uint256)',
  )
    .withArgs([newValueAddress(STRATEGY_ADDRESS)])
    .returns([newValueI32FromBigInt(value)]);
}

export function setupLiquityMocks(): ethereum.Event {
  let event = newMockEvent();

  createMockedFunction(
    event.address,
    'stabilityPool',
    'stabilityPool():(address)',
  )
    .withArgs([])
    .returns([newValueAddress(STABILITY_POOL_ADDRESS)]);

  createMockedFunction(event.address, 'priceFeed', 'priceFeed():(address)')
    .withArgs([])
    .returns([newValueAddress(PRICE_FEED_ADDRESS)]);

  return event;
}

export function newParamBytes(name: string, value: Bytes): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromBytes(value));
}

export function newParamI32(name: string, value: i32): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromI32(value));
}

export function newParamI32FromBigInt(
  name: string,
  value: string,
): ethereum.EventParam {
  return new ethereum.EventParam(
    name,
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString(value)),
  );
}

export function newValueI32FromBigInt(value: string): ethereum.Value {
  return ethereum.Value.fromUnsignedBigInt(BigInt.fromString(value));
}

export function newParamBool(name: string, value: bool): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromBoolean(value));
}

export function newParamAddress(
  name: string,
  value: string,
): ethereum.EventParam {
  return new ethereum.EventParam(
    name,
    ethereum.Value.fromAddress(Address.fromString(value)),
  );
}

export function newValueAddress(address: string): ethereum.Value {
  return ethereum.Value.fromAddress(Address.fromString(address));
}

export function newParamString(
  name: string,
  value: string,
): ethereum.EventParam {
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
