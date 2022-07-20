import { ethers } from 'hardhat';

const BigNumber = ethers.BigNumber;

export const SHARES_MULTIPLIER = BigNumber.from('10').pow(18);
export const CURVE_SLIPPAGE = BigNumber.from('5');
