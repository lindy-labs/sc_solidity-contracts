import { BigNumber } from 'ethers';
import { time } from '@openzeppelin/test-helpers';

export const getLastBlockTimestamp = async (): Promise<BigNumber> => {
  return BigNumber.from((await time.latest()).toString());
};

export const increaseTime = (amount: BigNumber | number) =>
  time.increase(amount) as Promise<BigNumber>;

export const moveForwardTwoWeeks = () => time.increase(time.duration.weeks(2));

export const moveForwardDays = (days: number) =>
  time.increase(time.duration.days(days));
