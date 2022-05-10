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
} from './helpers';

import {
  handleDepositMinted,
  handleSponsored,
  handleUnsponsored,
  handleDepositWithdrawn,
  handleYieldClaimed,
  handleTreasuryUpdated,
} from '../src/mappings/vault';
import {
  handleInitDeposit,
  handleInitRedeem,
  handleFinishDeposit,
  handleFinishRedeem,
  handleRearrangeDeposit,
  handleRearrangeRedeem,
} from '../src/mappings/strategy';
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
import {
  FinishDepositStable,
  FinishRedeemStable,
  InitDepositStable,
  InitRedeemStable,
  RearrangeDepositOperation,
  RearrangeRedeemOperation,
} from '../src/types/Strategy/AnchorStrategy';

const MOCK_ADDRESS_1 = '0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd'.toLowerCase();
const MOCK_ADDRESS_2 = '0xE80B3caAd6d2DE80Ac76a41d5F0072E36D2519Ce'.toLowerCase();
const TREASURY_ADDRESS = '0x4940c6e628da11ac0bdcf7f82be8579b4696fa33';

test('handleDepositMinted updates the Foundation', () => {
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
  let amount = newI32('amount', 10);
  let shares = newI32('shares', 10);
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
  assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '10');
  assert.fieldEquals('Foundation', foundationId, 'shares', '10');
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

  idParam = newI32('id', 1);
  amount = newI32('amount', 20);
  shares = newI32('shares', 15);
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
  assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '30');
  assert.fieldEquals('Foundation', foundationId, 'shares', '25');
  assert.fieldEquals('Foundation', foundationId, 'lockedUntil', '2');
  assert.fieldEquals(
    'Foundation',
    foundationId,
    'createdAt',
    event.block.timestamp.toString(),
  );
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

  handleYieldClaimed(event);

  assert.fieldEquals('Deposit', '1', 'shares', '17');
  assert.fieldEquals('Deposit', '2', 'shares', '34');

  assert.fieldEquals('Donation', donationId(mockEvent, '0'), 'amount', '99');
  assert.fieldEquals('Donation', donationId(mockEvent, '1'), 'amount', '48');
});
