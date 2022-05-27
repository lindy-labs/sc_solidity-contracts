import { DonationMint } from '../types/schema';
import {
  DonationMinted,
  DonationBurned,
} from '../types/Donations/Donations';

export function handleDonationMinted(event: DonationMinted): void {
  const donationMint = new DonationMint(event.params.donationId);

  donationMint.burned = false;
  donationMint.nftId = event.params.id;

  donationMint.save();
}

export function handleDonationBurned(event: DonationBurned): void {
  const donationMint = DonationMint.load(event.params.donationId)!;

  donationMint.burned = true;

  donationMint.save();
}
