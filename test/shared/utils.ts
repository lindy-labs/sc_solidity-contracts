import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Wallet } from 'ethers';

export const generateNewAddress = (): string => {
  return Wallet.createRandom().address;
};

// start and end are inclusive
export const arrayFromTo = (start: number, end: number) => {
  return Array.from('x'.repeat(end - start + 1)).reduce((memo, _curr) => {
    if (memo.length === 0) memo.push(start);
    else memo.push(1 + memo[memo.length - 1]);

    return memo;
  }, []);
};

export const getRoleErrorMsg = (
  account: SignerWithAddress,
  role: string,
): string => {
  return `AccessControl: account ${account.address.toLowerCase()} is missing role ${role}`;
};
