import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts';
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
import { Donation } from '../src/types/schema';
import {
  donationId,
  MOCK_ADDRESS_1,
  newAddress,
  newI32,
  newString,
} from './helpers';

test('DonationMinted event sets Donation record minted field to true', () => {
  clearStore();

  let mockDonation = newMockEvent();

  const donationID = donationId(mockDonation, '0');

  const donation = new Donation(donationID);
  donation.txHash = Bytes.fromUTF8('some-tx-hash');
  donation.amount = BigInt.fromString('495000000000000000000');
  donation.owner = Address.fromUTF8(MOCK_ADDRESS_1);
  donation.destination = Bytes.fromUTF8('some-destination');
  donation.minted = false;
  donation.burned = false;
  donation.save();

  assert.fieldEquals('Donation', donationID, 'minted', 'false');

  const donationEvent = new DonationMinted(
    mockDonation.address,
    mockDonation.logIndex,
    mockDonation.transactionLogIndex,
    mockDonation.logType,
    mockDonation.block,
    mockDonation.transaction,
    mockDonation.parameters,
  );
  donationEvent.parameters = new Array();

  donationEvent.parameters.push(newI32('id', 0));
  donationEvent.parameters.push(newI32('destinationId', 9));
  donationEvent.parameters.push(newString('groupId', 'some-group-id'));
  donationEvent.parameters.push(newString('token', 'some-token-address'));
  donationEvent.parameters.push(newI32('expiry', 16000000));
  donationEvent.parameters.push(newI32('amount', 150));
  donationEvent.parameters.push(
    newAddress('owner', '0x0000000000000000000000000000000000000000'),
  );
  donationEvent.parameters.push(newString('donationId', donationID));

  handleDonationMinted(donationEvent);

  assert.fieldEquals('Donation', donationID, 'minted', 'true');

  clearStore();
});

test('DonationBurned event sets Donation record burned field to true', () => {
  clearStore();

  let mockDonation = newMockEvent();

  const donationID = donationId(mockDonation, '0');

  const donation = new Donation(donationID);
  donation.txHash = Bytes.fromUTF8('some-tx-hash');
  donation.amount = BigInt.fromString('495000000000000000000');
  donation.owner = Address.fromUTF8(MOCK_ADDRESS_1);
  donation.destination = Bytes.fromUTF8('some-destination');
  donation.minted = true;
  donation.burned = false;
  donation.nftId = BigInt.fromString('0');
  donation.save();

  assert.fieldEquals('Donation', donationID, 'minted', 'true');
  assert.fieldEquals('Donation', donationID, 'burned', 'false');
  assert.fieldEquals('Donation', donationID, 'nftId', '0');

  const donationEvent = new DonationBurned(
    mockDonation.address,
    mockDonation.logIndex,
    mockDonation.transactionLogIndex,
    mockDonation.logType,
    mockDonation.block,
    mockDonation.transaction,
    mockDonation.parameters,
  );
  donationEvent.parameters = new Array();

  donationEvent.parameters.push(newI32('id', 0));
  donationEvent.parameters.push(newString('donationId', donationID));

  handleDonationBurned(donationEvent);

  assert.fieldEquals('Donation', donationID, 'minted', 'true');
  assert.fieldEquals('Donation', donationID, 'burned', 'true');
  assert.fieldEquals('Donation', donationID, 'nftId', '0');

  clearStore();
});
