import { BigNumber } from 'ethers';

export const SHARES_MULTIPLIER = BigNumber.from('10').pow(18);
export const CURVE_SLIPPAGE = BigNumber.from('500');

export const calcMinDy = (
  amount: BigNumber,
  fromDecimals: BigNumber,
  toDecimals: BigNumber,
  slippage: BigNumber,
) => {
  return amount
    .mul(slippage)
    .mul(BigNumber.from(10).pow(toDecimals))
    .div(BigNumber.from(10).pow(fromDecimals).mul(BigNumber.from(10000)));
};
