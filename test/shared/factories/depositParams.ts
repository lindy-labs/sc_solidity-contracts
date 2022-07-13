import { Factory } from 'fishery';
import { ethers, BigNumberish } from 'ethers';
import { time } from '@openzeppelin/test-helpers';

import type { ClaimParams } from './claimParams';
import { claimParams } from './claimParams';

const { parseUnits } = ethers.utils;

interface DepositParams {
  amount: BigNumberish;
  inputToken: string;
  claims: ClaimParams[];
  lockDuration: BigNumberish;
  name: string;
  slippage: BigNumberish;
}

export const depositParams = Factory.define<DepositParams>(() => {
  return {
    amount: parseUnits('1'),
    inputToken: '0x0',
    claims: [claimParams.build()],
    lockDuration: ethers.BigNumber.from(time.duration.weeks(2).toNumber()), // 2 weeks
    name: 'Foundation name',
    slippage: ethers.BigNumber.from(5),
  };
});
