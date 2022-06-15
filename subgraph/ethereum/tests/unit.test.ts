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
  newBool,
  newAddress,
  newString,
  donationId,
  createDeposit,
} from '../../tests/helpers';

import {
  handleDepositMinted,
  handleSponsored,
  handleUnsponsored,
  handleDepositWithdrawn,
  handleYieldClaimed,
  handleTreasuryUpdated,
} from '../src/mappings/vault';

import { Sponsored, Unsponsored } from '../src/types/Vault/IVaultSponsoring';
import {
  DepositWithdrawn,
  DepositMinted,
  YieldClaimed,
} from '../src/types/Vault/IVault';
import { TreasuryUpdated } from '../src/types/Vault/IVaultSettings';
import {
  Vault,
  Deposit,
  Sponsor,
  Claimer,
  Foundation,
  DepositOperation,
  RedeemOperation,
} from '../src/types/schema';

const MOCK_ADDRESS_1 =
  '0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd'.toLowerCase();
const MOCK_ADDRESS_2 =
  '0xE80B3caAd6d2DE80Ac76a41d5F0072E36D2519Ce'.toLowerCase();
const TREASURY_ADDRESS = '0x4940c6e628da11ac0bdcf7f82be8579b4696fa33';

test('handleTreasuryUpdated updates the treasury', () => {
  clearStore();

  let mockEvent = newMockEvent();
  const event = new TreasuryUpdated(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  const treasury = newAddress('treasury', MOCK_ADDRESS_1);
  event.parameters.push(treasury);

  // create vault
  const vault = new Vault(mockEvent.address.toHexString());
  vault.save();

  handleTreasuryUpdated(event);

  assert.fieldEquals(
    'Vault',
    mockEvent.address.toHexString(),
    'treasury',
    MOCK_ADDRESS_1,
  );
});

test('handleSponsored creates a Sponsor', () => {
  clearStore();

  let mockEvent = newMockEvent();
  const event = new Sponsored(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  const idParam = newI32('id', 1);
  const amount = newI32('amount', 1);
  const depositor = newAddress('depositor', MOCK_ADDRESS_1);
  const lockedUntil = newI32('lockedUntil', 1);
  const burned = newBool('burned', false);

  event.parameters.push(idParam);
  event.parameters.push(amount);
  event.parameters.push(depositor);
  event.parameters.push(lockedUntil);
  event.parameters.push(burned);

  handleSponsored(event);

  assert.fieldEquals('Sponsor', '1', 'amount', '1');
  assert.fieldEquals('Sponsor', '1', 'depositor', MOCK_ADDRESS_1);
  assert.fieldEquals('Sponsor', '1', 'burned', 'false');
});

test('handleUnsponsored removes a Sponsor by marking as burned', () => {
  clearStore();

  const sponsor = new Sponsor('1');
  sponsor.burned = false;
  sponsor.save();

  let mockEvent = newMockEvent();
  const event = new Unsponsored(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  const idParam = newI32('id', 1);

  event.parameters.push(idParam);

  handleUnsponsored(event);

  assert.fieldEquals('Sponsor', '1', 'burned', 'true');
});

test('handleDepositMinted creates a Deposit', () => {
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

  const idParam = newI32('id', 1);
  const groupId = newI32('groupId', 1);
  const amount = newI32('amount', 1);
  const shares = newI32('shares', 1);
  const depositor = newAddress('depositor', MOCK_ADDRESS_1);
  const claimer = newAddress('claimer', MOCK_ADDRESS_1);
  const lockedUntil = newI32('lockedUntil', 1);
  const data = newBytes('data', Bytes.empty());
  const name = newString('name', 'Foundation');

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

  assert.fieldEquals('Deposit', '1', 'amount', '1');
  assert.fieldEquals('Deposit', '1', 'depositor', MOCK_ADDRESS_1);
  assert.fieldEquals('Deposit', '1', 'claimer', MOCK_ADDRESS_1);
  assert.fieldEquals('Claimer', MOCK_ADDRESS_1, 'principal', '1');
  assert.fieldEquals('Claimer', MOCK_ADDRESS_1, 'depositsIds', '[1]');

  const foundationId = `${vault.id}-1`;
  assert.fieldEquals('Foundation', foundationId, 'name', 'Foundation');
  assert.fieldEquals('Foundation', foundationId, 'owner', MOCK_ADDRESS_1);
  assert.fieldEquals('Foundation', foundationId, 'vault', vault.id);
  assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '1');
  assert.fieldEquals('Foundation', foundationId, 'lockedUntil', '1');
  assert.fieldEquals(
    'Foundation',
    foundationId,
    'createdAt',
    event.block.timestamp.toString(),
  );
});

test("handleDepositMinted uses the last event's name as the Foundation's name", () => {
  clearStore();

  let mockEvent = newMockEvent();
  let event = new DepositMinted(
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

  const idParam = newI32('id', 1);
  const groupId = newI32('groupId', 1);
  const amount = newI32('amount', 1);
  const shares = newI32('shares', 1);
  const depositor = newAddress('depositor', MOCK_ADDRESS_1);
  const claimer = newAddress('claimer', MOCK_ADDRESS_1);
  const claimerId = newAddress('claimerId', MOCK_ADDRESS_1);
  const lockedUntil = newI32('lockedUntil', 1);
  const data = newBytes('data', Bytes.empty());
  let name = newString('name', 'Foundation');

  event.parameters.push(idParam);
  event.parameters.push(groupId);
  event.parameters.push(amount);
  event.parameters.push(shares);
  event.parameters.push(depositor);
  event.parameters.push(claimer);
  event.parameters.push(claimerId);
  event.parameters.push(lockedUntil);
  event.parameters.push(data);
  event.parameters.push(name);

  handleDepositMinted(event);

  const foundationId = `${mockEvent.address.toHexString()}-1`;
  assert.fieldEquals('Foundation', foundationId, 'name', 'Foundation');

  // Sending another DepositMinted that updates the name

  mockEvent = newMockEvent();
  event = new DepositMinted(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  name = newString('name', 'Updated Foundation Name');

  event.parameters.push(idParam);
  event.parameters.push(groupId);
  event.parameters.push(amount);
  event.parameters.push(shares);
  event.parameters.push(depositor);
  event.parameters.push(claimer);
  event.parameters.push(claimerId);
  event.parameters.push(lockedUntil);
  event.parameters.push(data);
  event.parameters.push(name);

  handleDepositMinted(event);

  assert.fieldEquals(
    'Foundation',
    foundationId,
    'name',
    'Updated Foundation Name',
  );
});

test("handleDepositWithdrawn doesn't remove a Deposit for partial withdraws", () => {
  clearStore();

  let mockEvent = newMockEvent();

  const claimer = new Claimer('1');
  claimer.save();

  const deposit = new Deposit('1');
  deposit.burned = false;
  deposit.amount = BigInt.fromI32(10);
  deposit.lockedUntil = BigInt.fromI32(1);
  deposit.shares = BigInt.fromI32(10);
  deposit.claimer = '1';
  deposit.foundation = '1';
  deposit.save();

  const vault = new Vault(mockEvent.address.toHexString());
  vault.save();

  const foundation = new Foundation('1');
  foundation.vault = mockEvent.address.toHexString();
  foundation.amountDeposited = BigInt.fromI32(10);
  foundation.shares = BigInt.fromI32(10);
  foundation.save();

  const event = new DepositWithdrawn(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  event.parameters.push(newI32('id', 1));
  event.parameters.push(newI32('shares', 5));
  event.parameters.push(newI32('amount', 5));
  event.parameters.push(newAddress('to', MOCK_ADDRESS_1));
  event.parameters.push(newBool('burned', false));

  handleDepositWithdrawn(event);

  assert.fieldEquals('Deposit', '1', 'burned', 'false');
  assert.fieldEquals('Deposit', '1', 'shares', '5');
  assert.fieldEquals('Deposit', '1', 'amount', '5');
  assert.fieldEquals('Foundation', '1', 'amountDeposited', '5');
  assert.fieldEquals('Foundation', '1', 'shares', '5');
});

test('handleDepositWithdrawn removes a Deposit by marking as burned', () => {
  clearStore();

  let mockEvent = newMockEvent();

  const claimer = new Claimer('1');
  claimer.save();

  const deposit = new Deposit('1');
  deposit.burned = false;
  deposit.amount = BigInt.fromI32(1);
  deposit.lockedUntil = BigInt.fromI32(1);
  deposit.shares = BigInt.fromI32(1);
  deposit.claimer = '1';
  deposit.foundation = '1';
  deposit.save();

  const vault = new Vault(mockEvent.address.toHexString());
  vault.save();

  const foundation = new Foundation('1');
  foundation.vault = mockEvent.address.toHexString();
  foundation.amountDeposited = BigInt.fromI32(1);
  foundation.shares = BigInt.fromI32(1);
  foundation.save();

  const event = new DepositWithdrawn(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
  );
  event.parameters = new Array();

  event.parameters.push(newI32('id', 1));
  event.parameters.push(newI32('shares', 1));
  event.parameters.push(newI32('amount', 1));
  event.parameters.push(newAddress('to', MOCK_ADDRESS_1));
  event.parameters.push(newBool('burned', true));

  handleDepositWithdrawn(event);

  assert.fieldEquals('Deposit', '1', 'burned', 'true');
  assert.fieldEquals('Deposit', '1', 'shares', '0');
  assert.fieldEquals('Deposit', '1', 'amount', '0');
  assert.fieldEquals('Foundation', '1', 'amountDeposited', '0');
  assert.fieldEquals('Foundation', '1', 'shares', '0');
});

test('handleYieldClaimed reduces shares from Deposits and creates Donations', () => {
  clearStore();

  let mockEvent = newMockEvent();

  // Create deposits
  createDeposit('1', 50, false, '1', '1', 1, 50);
  createDeposit('2', 100, false, '1', '1', 1, 100);

  // Create vault
  const vault = new Vault(mockEvent.address.toHexString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  // Create claimer
  const claimer = new Claimer(MOCK_ADDRESS_1);
  claimer.vault = mockEvent.address.toHexString();
  claimer.depositsIds = ['1', '2'];
  claimer.save();

  // Create foundation
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

  event.parameters.push(newAddress('claimerId', MOCK_ADDRESS_1));
  event.parameters.push(newAddress('to', TREASURY_ADDRESS));
  event.parameters.push(newI32('amount', 150));
  event.parameters.push(newI32('burnedShares', 75));
  event.parameters.push(newI32('perfFee', 0));
  event.parameters.push(newI32('totalUnderlying', 300));
  event.parameters.push(newI32('totalShares', 150));

  handleYieldClaimed(event);

  assert.fieldEquals('Deposit', '1', 'shares', '25');
  assert.fieldEquals('Deposit', '2', 'shares', '50');

  assert.fieldEquals('Donation', donationId(mockEvent, '0'), 'amount', '50');
  assert.fieldEquals('Donation', donationId(mockEvent, '1'), 'amount', '100');

  clearStore();
});

test('handleYieldClaimed takes the performance fee into account', () => {
  clearStore();

  let mockEvent = newMockEvent();

  // Create deposits
  createDeposit('1', 50, false, '1', '1', 1, 50);
  createDeposit('2', 100, false, '1', '1', 1, 100);

  // Create vault
  const vault = new Vault(mockEvent.address.toHexString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  // Create claimer
  const claimer = new Claimer(MOCK_ADDRESS_1);
  claimer.vault = mockEvent.address.toHexString();
  claimer.depositsIds = ['1', '2'];
  claimer.save();

  // Create foundation
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

  event.parameters.push(newAddress('claimerId', MOCK_ADDRESS_1));
  event.parameters.push(newAddress('to', TREASURY_ADDRESS));
  event.parameters.push(newI32('amount', 120));
  event.parameters.push(newI32('burnedShares', 75));
  event.parameters.push(newI32('perfFee', 30));
  event.parameters.push(newI32('totalUnderlying', 300));
  event.parameters.push(newI32('totalShares', 150));

  handleYieldClaimed(event);

  assert.fieldEquals('Claimer', MOCK_ADDRESS_1, 'claimed', '120');

  assert.fieldEquals('Deposit', '1', 'shares', '25');
  assert.fieldEquals('Deposit', '2', 'shares', '50');

  assert.fieldEquals('Donation', donationId(mockEvent, '0'), 'amount', '40');
  assert.fieldEquals('Donation', donationId(mockEvent, '1'), 'amount', '80');

  clearStore();
});

test("handleYieldClaimed doesn't create donations if the deposits are not to the treasury", () => {
  clearStore();

  let mockEvent = newMockEvent();

  // Create deposits
  createDeposit('1', 50, false, '1', '1', 1, 50);
  createDeposit('2', 100, false, '1', '1', 1, 100);

  // Create vault
  const vault = new Vault(mockEvent.address.toHexString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  // Create claimer
  const claimer = new Claimer(MOCK_ADDRESS_2);
  claimer.vault = mockEvent.address.toHexString();
  claimer.depositsIds = ['1', '2'];
  claimer.save();

  // Create foundation
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
  event.parameters.push(newAddress('to', MOCK_ADDRESS_1));
  event.parameters.push(newI32('amount', 150));
  event.parameters.push(newI32('burnedShares', 75));
  event.parameters.push(newI32('perfFee', 0));
  event.parameters.push(newI32('totalUnderlying', 300));
  event.parameters.push(newI32('totalShares', 150));

  handleYieldClaimed(event);

  assert.notInStore('Donation', donationId(mockEvent, '0'));
  assert.notInStore('Donation', donationId(mockEvent, '1'));

  clearStore();
});
