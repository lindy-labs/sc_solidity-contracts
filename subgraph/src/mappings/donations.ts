import { Donation } from '../types/schema';
import {
  DonationMinted,
  DonationBurned,
} from '../types/Donations/Donations';

export function handleDonationMinted(event: DonationMinted): void {
  const donation = Donation.load(event.params.donationId)!;

  donation.minted = true;
  donation.nftId = event.params.id;

  donation.save();
}

export function handleDonationBurned(event: DonationBurned): void {
  const donation = Donation.load(event.params.donationId)!;

  donation.burned = true;

  donation.save();
}
