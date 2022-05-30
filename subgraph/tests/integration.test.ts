import { Address, Bytes, BigInt } from '@graphprotocol/graph-ts';
import {
  test,
  assert,
  newMockEvent,
  clearStore,
} from 'matchstick-as/assembly/index';

import {
  newBytes,
  newI32,
  newI32FromBigInt,
  newBool,
  newAddress,
  newString,
  donationId,
  createDeposit,
} from './helpers';

import {
  handleDepositMinted,
  handleDepositWithdrawn,
  handleYieldClaimed,
} from '../src/mappings/vault';

import {
  DepositWithdrawn,
  DepositMinted,
  YieldClaimed,
} from '../src/types/Vault/IVault';

import { Vault, Claimer, Foundation } from '../src/types/schema';

const MOCK_ADDRESS_1 = '0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd'.toLowerCase();
const MOCK_ADDRESS_2 = '0xE80B3caAd6d2DE80Ac76a41d5F0072E36D2519Ce'.toLowerCase();
const TREASURY_ADDRESS = '0x4940c6e628da11ac0bdcf7f82be8579b4696fa33';

test('error 1', () => {
  clearStore();

  let mockEvent = newMockEvent();
  const event = new DepositMinted(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  const vault = new Vault(mockEvent.address.toHexString());
  vault.save();

  let idParam = newI32('id', 1);
  const groupId = newI32('groupId', 1);
  let amount = newI32FromBigInt(
    'amount',
    '100000000000000000000000000000000000000',
  );
  let shares = newI32FromBigInt(
    'shares',
    '516390519215273114966053025248976448780521582378',
  );
  let depositor = newAddress('depositor', MOCK_ADDRESS_1);
  let claimer = newAddress('claimer', MOCK_ADDRESS_1);
  let lockedUntil = newI32('lockedUntil', 1);
  let data = newBytes('data', Bytes.empty());
  let name = newString('name', 'Foundation');

  event.parameters.push(idParam);
  event.parameters.push(groupId);
  event.parameters.push(amount);
  event.parameters.push(shares);
  event.parameters.push(depositor);
  event.parameters.push(claimer);
  event.parameters.push(claimer);
  event.parameters.push(lockedUntil);
  event.parameters.push(data);
  event.parameters.push(name);

  handleDepositMinted(event);

  mockEvent = newMockEvent();
  const event3 = new YieldClaimed(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event3.parameters = new Array();

  event3.parameters.push(newAddress('claimerId', MOCK_ADDRESS_1));
  event3.parameters.push(newAddress('to', MOCK_ADDRESS_1));
  event3.parameters.push(
    newI32FromBigInt('amount', '9090909090909090909090909090909090909'),
  );
  event3.parameters.push(newI32FromBigInt('burnedShares', '99999999999999999'));
  event3.parameters.push(newI32FromBigInt('perfFee', '0'));
  event3.parameters.push(
    newI32FromBigInt('totalUnderlying', '1100000000000000000000'),
  );
  event3.parameters.push(
    newI32FromBigInt('totalShares', '1000000000000000000000000000000000000000'),
  );

  handleYieldClaimed(event3);
});

test('handles scenarios with rounding matters', () => {
  clearStore();

  // Deposit 1

  let mockEvent = newMockEvent();
  const event = new DepositMinted(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  const vault = new Vault(mockEvent.address.toHexString());
  vault.save();

  let idParam = newI32('id', 1);
  const groupId = newI32('groupId', 1);
  let amount = newI32FromBigInt('amount', '500000000000000000000');
  let shares = newI32FromBigInt(
    'shares',
    '500000000000000000000000000000000000000',
  );
  let depositor = newAddress('depositor', MOCK_ADDRESS_1);
  let claimer = newAddress('claimer', MOCK_ADDRESS_1);
  let lockedUntil = newI32('lockedUntil', 1);
  let data = newBytes('data', Bytes.empty());
  let name = newString('name', 'Foundation');

  event.parameters.push(idParam);
  event.parameters.push(groupId);
  event.parameters.push(amount);
  event.parameters.push(shares);
  event.parameters.push(depositor);
  event.parameters.push(claimer);
  event.parameters.push(claimer);
  event.parameters.push(lockedUntil);
  event.parameters.push(data);
  event.parameters.push(name);

  handleDepositMinted(event);

  const foundationId = `${vault.id}-1`;

  // Deposit 2

  mockEvent = newMockEvent();
  const event2 = new DepositMinted(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event2.parameters = new Array();

  idParam = newI32('id', 2);
  depositor = newAddress('depositor', MOCK_ADDRESS_1);
  claimer = newAddress('claimer', MOCK_ADDRESS_2);
  lockedUntil = newI32('lockedUntil', 1);
  data = newBytes('data', Bytes.empty());
  name = newString('name', 'Foundation');

  event2.parameters.push(idParam);
  event2.parameters.push(groupId);
  event2.parameters.push(amount);
  event2.parameters.push(shares);
  event2.parameters.push(depositor);
  event2.parameters.push(claimer);
  event2.parameters.push(claimer);
  event2.parameters.push(lockedUntil);
  event2.parameters.push(data);
  event2.parameters.push(name);

  handleDepositMinted(event2);

  assert.fieldEquals('Foundation', foundationId, 'name', 'Foundation');
  assert.fieldEquals(
    'Foundation',
    foundationId,
    'amountDeposited',
    '1000000000000000000000',
  );
  assert.fieldEquals(
    'Foundation',
    foundationId,
    'shares',
    '1000000000000000000000000000000000000000',
  );
  assert.fieldEquals('Foundation', foundationId, 'lockedUntil', '1');

  // Claim Yield

  mockEvent = newMockEvent();
  const event3 = new YieldClaimed(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event3.parameters = new Array();

  event3.parameters.push(newAddress('claimerId', MOCK_ADDRESS_1));
  event3.parameters.push(newAddress('to', MOCK_ADDRESS_1));
  event3.parameters.push(newI32FromBigInt('amount', '49500000000000000000'));
  event3.parameters.push(
    newI32FromBigInt('burnedShares', '45454545454545454545454545454545454545'),
  );
  event3.parameters.push(newI32FromBigInt('perfFee', '499999999999999999'));
  event3.parameters.push(
    newI32FromBigInt('totalUnderlying', '1100000000000000000000'),
  );
  event3.parameters.push(
    newI32FromBigInt('totalShares', '1000000000000000000000000000000000000000'),
  );

  handleYieldClaimed(event3);
});

test('updates the Foundation', () => {
  clearStore();

  let mockEvent = newMockEvent();
  const event = new DepositMinted(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  const vault = new Vault(mockEvent.address.toHexString());
  vault.save();

  let idParam = newI32('id', 1);
  const groupId = newI32('groupId', 1);
  let amount = newI32('amount', 30);
  let shares = newI32('shares', 30);
  let depositor = newAddress('depositor', MOCK_ADDRESS_1);
  let claimer = newAddress('claimer', MOCK_ADDRESS_1);
  let lockedUntil = newI32('lockedUntil', 1);
  let data = newBytes('data', Bytes.empty());
  let name = newString('name', 'Foundation');

  event.parameters.push(idParam);
  event.parameters.push(groupId);
  event.parameters.push(amount);
  event.parameters.push(shares);
  event.parameters.push(depositor);
  event.parameters.push(claimer);
  event.parameters.push(claimer);
  event.parameters.push(lockedUntil);
  event.parameters.push(data);
  event.parameters.push(name);

  handleDepositMinted(event);

  const foundationId = `${vault.id}-1`;

  assert.fieldEquals('Foundation', foundationId, 'name', 'Foundation');
  assert.fieldEquals('Foundation', foundationId, 'owner', MOCK_ADDRESS_1);
  assert.fieldEquals('Foundation', foundationId, 'vault', vault.id);
  assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '30');
  assert.fieldEquals('Foundation', foundationId, 'shares', '30');
  assert.fieldEquals('Foundation', foundationId, 'lockedUntil', '1');
  assert.fieldEquals(
    'Foundation',
    foundationId,
    'createdAt',
    event.block.timestamp.toString(),
  );

  // Second deposit

  mockEvent = newMockEvent();
  const event2 = new DepositMinted(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event2.parameters = new Array();

  idParam = newI32('id', 2);
  amount = newI32('amount', 40);
  shares = newI32('shares', 40);
  depositor = newAddress('depositor', MOCK_ADDRESS_1);
  claimer = newAddress('claimer', MOCK_ADDRESS_1);
  lockedUntil = newI32('lockedUntil', 2);
  data = newBytes('data', Bytes.empty());
  name = newString('name', 'Foundation 2');

  event2.parameters.push(idParam);
  event2.parameters.push(groupId);
  event2.parameters.push(amount);
  event2.parameters.push(shares);
  event2.parameters.push(depositor);
  event2.parameters.push(claimer);
  event2.parameters.push(claimer);
  event2.parameters.push(lockedUntil);
  event2.parameters.push(data);
  event2.parameters.push(name);

  handleDepositMinted(event2);

  assert.fieldEquals('Foundation', foundationId, 'name', 'Foundation 2');
  assert.fieldEquals('Foundation', foundationId, 'owner', MOCK_ADDRESS_1);
  assert.fieldEquals('Foundation', foundationId, 'vault', vault.id);
  assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '70');
  assert.fieldEquals('Foundation', foundationId, 'shares', '70');
  assert.fieldEquals('Foundation', foundationId, 'lockedUntil', '2');
  assert.fieldEquals(
    'Foundation',
    foundationId,
    'createdAt',
    event.block.timestamp.toString(),
  );

  // Partial withdraw

  mockEvent = newMockEvent();
  const event3 = new DepositWithdrawn(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event3.parameters = new Array();

  event3.parameters.push(newI32('id', 1));
  event3.parameters.push(newI32('shares', 10));
  event3.parameters.push(newI32('amount', 10));
  event3.parameters.push(newAddress('to', MOCK_ADDRESS_1));
  event3.parameters.push(newBool('burned', false));

  handleDepositWithdrawn(event3);

  assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '60');
  assert.fieldEquals('Foundation', foundationId, 'shares', '60');
  assert.fieldEquals('Foundation', foundationId, 'amountClaimed', '0');

  // Claim yield

  mockEvent = newMockEvent();
  const event4 = new YieldClaimed(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event4.parameters = new Array();

  event4.parameters.push(newAddress('claimerId', MOCK_ADDRESS_1));
  event4.parameters.push(newAddress('to', MOCK_ADDRESS_1));
  event4.parameters.push(newI32('amount', 60));
  event4.parameters.push(newI32('burnedShares', 30));
  event4.parameters.push(newI32('perfFee', 0));
  event4.parameters.push(newI32('totalUnderlying', 120));
  event4.parameters.push(newI32('totalShares', 60));

  handleYieldClaimed(event4);

  assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '60');
  assert.fieldEquals('Foundation', foundationId, 'shares', '30');
  assert.fieldEquals('Foundation', foundationId, 'amountClaimed', '60');
});

test('handleYieldClaimed handles scenarios where only one of the deposits generated yield', () => {
  clearStore();

  let mockEvent = newMockEvent();

  // Create deposits
  createDeposit('1', 50, false, '1', '1', 1, 50);
  createDeposit('2', 100, false, '1', '1', 1, 50);

  const vault = new Vault(mockEvent.address.toHexString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  const claimer = new Claimer(MOCK_ADDRESS_2);
  claimer.vault = mockEvent.address.toHexString();
  claimer.depositsIds = ['1', '2'];
  claimer.save();

  const foundation = new Foundation('1');
  foundation.vault = mockEvent.address.toHexString();
  foundation.save();

  const event = new YieldClaimed(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  event.parameters.push(newAddress('claimerId', MOCK_ADDRESS_2));
  event.parameters.push(newAddress('to', TREASURY_ADDRESS));
  event.parameters.push(newI32('amount', 50));
  event.parameters.push(newI32('burnedShares', 25));
  event.parameters.push(newI32('perfFee', 0));
  event.parameters.push(newI32('totalUnderlying', 200));
  event.parameters.push(newI32('totalShares', 100));

  handleYieldClaimed(event);

  assert.fieldEquals('Deposit', '1', 'shares', '25');
  assert.fieldEquals('Deposit', '2', 'shares', '50');

  assert.fieldEquals('Donation', donationId(mockEvent, '0'), 'amount', '50');
});

test('handleYieldClaimed handles scenarios where the yield is not proportional to the deposit shares', () => {
  clearStore();

  let mockEvent = newMockEvent();

  createDeposit('1', 50, false, '1', '1', 1, 50);
  createDeposit('2', 100, false, '1', '1', 1, 50);

  const vault = new Vault(mockEvent.address.toHexString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  const claimer = new Claimer(MOCK_ADDRESS_2);
  claimer.vault = mockEvent.address.toHexString();
  claimer.depositsIds = ['1', '2'];
  claimer.save();

  const foundation = new Foundation('1');
  foundation.vault = mockEvent.address.toHexString();
  foundation.save();

  const event = new YieldClaimed(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  event.parameters.push(newAddress('claimerId', MOCK_ADDRESS_2));
  event.parameters.push(newAddress('to', TREASURY_ADDRESS));
  event.parameters.push(newI32('amount', 147));
  event.parameters.push(newI32('burnedShares', 49));
  event.parameters.push(newI32('perfFee', 0));
  // these numbers are only used to calculate the pricer per share
  // in this scenario, it's impossible to find the real numbers, so'll just use these two
  // because only the ratio between them matters for the purpose of this test
  event.parameters.push(newI32('totalUnderlying', 147));
  event.parameters.push(newI32('totalShares', 49));

  handleYieldClaimed(event);

  assert.fieldEquals('Deposit', '1', 'shares', '17');
  assert.fieldEquals('Deposit', '2', 'shares', '34');

  assert.fieldEquals('Donation', donationId(mockEvent, '0'), 'amount', '99');
  assert.fieldEquals('Donation', donationId(mockEvent, '1'), 'amount', '48');
});
