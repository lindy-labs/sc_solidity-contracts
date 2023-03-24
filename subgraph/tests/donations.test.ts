import { BigInt } from '@graphprotocol/graph-ts';
import {
  test,
  assert,
  newMockEvent,
  clearStore,
} from 'matchstick-as/assembly/index';
import {
  handleDonationMinted,
  handleDonationBurned,
  handleDonationsSent,
} from '../src/mappings/donations';
import {
  DonationBurned,
  DonationMinted,
  DonationsSent,
} from '../src/types/Donations/Donations';
import { DonationMint } from '../src/types/schema';
import {
  donationId,
  newParamAddress,
  newParamI32,
  newParamString,
} from '../tests/helpers';

test('DonationsSent event creates DonationsSent record', () => {
  clearStore();

  let mockDonationsSent = newMockEvent();

  const donationsSentID = mockDonationsSent.transaction.hash.toHexString();

  const mockToAddress = '0x0000000000000000000000000000000000000001';

  const donationsSentEvent = new DonationsSent(
    mockDonationsSent.address,
    mockDonationsSent.logIndex,
    mockDonationsSent.transactionLogIndex,
    mockDonationsSent.logType,
    mockDonationsSent.block,
    mockDonationsSent.transaction,
    mockDonationsSent.parameters,
    null,
  );
  donationsSentEvent.parameters = new Array();

  donationsSentEvent.parameters.push(newParamI32('destinationId', 9));
  donationsSentEvent.parameters.push(
    newParamString('token', '0x0000000000000000000000000000000000000000'),
  );
  donationsSentEvent.parameters.push(newParamAddress('to', mockToAddress));
  donationsSentEvent.parameters.push(newParamI32('amount', 100));

  handleDonationsSent(donationsSentEvent);

  assert.fieldEquals('DonationsSent', donationsSentID, 'destination', '9');
  assert.fieldEquals(
    'DonationsSent',
    donationsSentID,
    'timestamp',
    mockDonationsSent.block.timestamp.toString(),
  );
  assert.fieldEquals(
    'DonationsSent',
    donationsSentID,
    'address',
    mockToAddress,
  );
  assert.fieldEquals('DonationsSent', donationsSentID, 'amount', '100');

  clearStore();
});

test('DonationMinted event creates DonationMint record', () => {
  clearStore();

  let mockDonation = newMockEvent();

  const donationID = donationId(mockDonation, '0');

  const donationEvent = new DonationMinted(
    mockDonation.address,
    mockDonation.logIndex,
    mockDonation.transactionLogIndex,
    mockDonation.logType,
    mockDonation.block,
    mockDonation.transaction,
    mockDonation.parameters,
    null,
  );
  donationEvent.parameters = new Array();

  donationEvent.parameters.push(newParamI32('id', 0));
  donationEvent.parameters.push(newParamI32('destinationId', 9));
  donationEvent.parameters.push(newParamString('groupId', 'some-group-id'));
  donationEvent.parameters.push(
    newParamAddress('token', '0x0000000000000000000000000000000000000000'),
  );
  donationEvent.parameters.push(newParamI32('expiry', 16000000));
  donationEvent.parameters.push(newParamI32('amount', 150));
  donationEvent.parameters.push(
    newParamAddress('owner', '0x0000000000000000000000000000000000000000'),
  );
  donationEvent.parameters.push(newParamString('donationId', donationID));
  donationEvent.parameters.push(
    newParamAddress('vault', '0x0000000000000000000000000000000000000000'),
  );

  handleDonationMinted(donationEvent);

  assert.fieldEquals('DonationMint', donationID, 'id', donationID);
  assert.fieldEquals('DonationMint', donationID, 'nftId', '0');
  assert.fieldEquals('DonationMint', donationID, 'burned', 'false');
  assert.fieldEquals(
    'DonationMint',
    donationID,
    'vault',
    '0x0000000000000000000000000000000000000000',
  );
  assert.fieldEquals('DonationMint', donationID, 'destination', '9');
  assert.fieldEquals(
    'DonationMint',
    donationID,
    'token',
    '0x0000000000000000000000000000000000000000',
  );
  assert.fieldEquals(
    'DonationMint',
    donationID,
    'timestamp',
    mockDonation.block.timestamp.toString(),
  );

  clearStore();
});

test('DonationBurned event sets DonationMint record burned field to true', () => {
  clearStore();

  let mockDonation = newMockEvent();

  const donationID = donationId(mockDonation, '0');

  const donation = new DonationMint(donationID);
  donation.burned = false;
  donation.nftId = BigInt.fromString('0');
  donation.save();

  assert.fieldEquals('DonationMint', donationID, 'burned', 'false');
  assert.fieldEquals('DonationMint', donationID, 'nftId', '0');

  const donationEvent = new DonationBurned(
    mockDonation.address,
    mockDonation.logIndex,
    mockDonation.transactionLogIndex,
    mockDonation.logType,
    mockDonation.block,
    mockDonation.transaction,
    mockDonation.parameters,
    null,
  );
  donationEvent.parameters = new Array();

  donationEvent.parameters.push(newParamI32('id', 0));
  donationEvent.parameters.push(newParamString('donationId', donationID));

  handleDonationBurned(donationEvent);

  assert.fieldEquals('DonationMint', donationID, 'burned', 'true');
  assert.fieldEquals('DonationMint', donationID, 'nftId', '0');

  clearStore();
});
