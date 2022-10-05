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
} from '../src/mappings/donations';
import {
  DonationBurned,
  DonationMinted,
} from '../src/types/Donations/Donations';
import { DonationMint } from '../src/types/schema';
import { donationId, newParamAddress, newParamI32, newParamString } from '../../tests/helpers';

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
  donationEvent.parameters.push(newParamString('token', 'some-token-address'));
  donationEvent.parameters.push(newParamI32('expiry', 16000000));
  donationEvent.parameters.push(newParamI32('amount', 150));
  donationEvent.parameters.push(
    newParamAddress('owner', '0x0000000000000000000000000000000000000000'),
  );
  donationEvent.parameters.push(newParamString('donationId', donationID));

  handleDonationMinted(donationEvent);

  assert.fieldEquals('DonationMint', donationID, 'id', donationID);
  assert.fieldEquals('DonationMint', donationID, 'nftId', '0');
  assert.fieldEquals('DonationMint', donationID, 'burned', 'false');

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