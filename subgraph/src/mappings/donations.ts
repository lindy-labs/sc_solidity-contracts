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
  const donationsSent = new DonationsSent(event.transaction.hash.toHexString());

  donationsSent.destination = event.params.destinationId;
  donationsSent.timestamp = event.block.timestamp;
  donationsSent.address = event.params.to;
  donationsSent.amount = event.params.amount;

  donationsSent.save();
}
