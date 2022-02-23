import { network } from "hardhat";

interface Config {
  investPct: number;
  multisig: string;
  minLockPeriod: number;
}

const networkConfigs: Record<number, Config> = {
  // mainnet
  1: {
    investPct: 9000, // 90%
    multisig: "TODO",
    minLockPeriod: 60 * 60 * 24 * 30, // 30 days
  },

  // rinkeby
  4: {
    investPct: 9000, // 90%
    multisig: "TODO",
    minLockPeriod: 1, // 1 second
  },

  // docker network
  1337: {
    investPct: 9000, // 90%
    multisig: "TODO",
    minLockPeriod: 1, // 1 second
  },

  // hardhat
  31337: {
    investPct: 9000, // 90%
    multisig: "TODO",
    minLockPeriod: 1, // 1 second
  },
};

export default networkConfigs;

export const getCurrentNetworkConfig = () =>
  networkConfigs[network.config.chainId];
