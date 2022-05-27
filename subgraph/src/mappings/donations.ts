import { DonationMint } from '../types/schema';
import {
  DonationMinted,
  DonationBurned,
} from '../types/Donations/Donations';

export function handleDonationMinted(event: DonationMinted): void {
  const donation = new DonationMint(event.params.donationId);

  donation.burned = false;
  donation.nftId = event.params.id;

  donation.save();
}

export function handleDonationBurned(event: DonationBurned): void {
  const donation = DonationMint.load(event.params.donationId)!;

  donation.burned = true;

  donation.save();
}
