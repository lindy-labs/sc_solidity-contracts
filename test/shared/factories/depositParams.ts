import { Factory } from "fishery";
import { ethers, BigNumberish } from "ethers";
import { time } from "@openzeppelin/test-helpers";

import type { ClaimParams } from "./claimParams";
import { claimParams } from "./claimParams";

const { parseUnits } = ethers.utils;

interface DepositParams {
  amount: BigNumberish;
  claims: ClaimParams[];
  lockDuration: BigNumberish;
}

export const depositParams = Factory.define<DepositParams>(() => {
  return {
    amount: parseUnits("1"),
    claims: [claimParams.build()],
    lockDuration: ethers.BigNumber.from(time.duration.weeks(2).toNumber()), // 2 weeks
  };
});
