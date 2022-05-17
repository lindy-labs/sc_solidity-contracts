// import { store } from '@graphprotocol/graph-ts';
import { Donation, DonationMint } from '../types/schema';
import {
  DonationMinted,
} from '../types/Donations/Donations';

export function handleDonationMinted(event: DonationMinted): void {
  const id = event.params.donationId;

  const donationMint = new DonationMint(id);
  donationMint.burned = false;

  donationMint.save();
}
