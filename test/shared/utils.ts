import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Wallet, BigNumber, utils } from 'ethers';

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

export const approxWholeTokens = (
  actual: BigNumber,
  expected: BigNumber,
  decimals: string = '18',
): boolean => {
  const one_unit = utils.parseUnits('1', decimals);
  actual = actual.div(one_unit);
  expected = expected.div(one_unit);
  return actual.eq(expected);
};
