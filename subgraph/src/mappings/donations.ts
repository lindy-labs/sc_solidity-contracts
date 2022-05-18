// import { store } from '@graphprotocol/graph-ts';
import { Donation } from '../types/schema';
import {
  DonationMinted,
} from '../types/Donations/Donations';

export function handleDonationMinted(event: DonationMinted): void {
  const id = event.params.donationId;
  const donation = Donation.load(id)!;

  donation.minted = true;

  donation.save();
}
