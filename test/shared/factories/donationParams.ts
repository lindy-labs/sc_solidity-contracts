import { BigNumberish, constants } from 'ethers';
import { Factory } from 'fishery';
import { ethers } from 'ethers';

const { parseUnits } = ethers.utils;

interface DonationParams {
  amount: BigNumberish;
  destinationId: BigNumberish;
  owner: string;
  token: string;
  donationId: string;
}

export const donationParams = Factory.define<DonationParams>(() => {
  return {
    amount: parseUnits('1'),
    destinationId: parseUnits('1'),
    owner: '0x000000000000000000000000000000000000dEaD',
    token: '0x000000000000000000000000000000000000dEaD',
    donationId: 'some-donation-id',
    vault: constants.AddressZero,
  };
});
