import { DonationMint, DonationsSent } from '../types/schema';
import { DonationMinted, DonationBurned, DonationsSent as DonationsSentEvent} from '../types/Donations/Donations';

export function handleDonationMinted(event: DonationMinted): void {
  const donationMint = new DonationMint(event.params.donationId);

  donationMint.vault = event.params.vault.toHexString();
  donationMint.burned = false;
  donationMint.nftId = event.params.id;

  donationMint.save();
}

export function handleDonationBurned(event: DonationBurned): void {
  const donationMint = DonationMint.load(event.params.donationId)!;

  donationMint.burned = true;

  donationMint.save();
}

export function handleDonationsSent(event: DonationsSentEvent): void {
  const donationSent = new DonationsSent(event.transaction.hash.toHex());
  donationSent.destination = event.params.destinationId;
  donationSent.timestamp = event.block.timestamp;

  donationSent.save();
}
