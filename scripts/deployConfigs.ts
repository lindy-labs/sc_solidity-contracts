import { network, getNamedAccounts, ethers } from "hardhat";
import { BigNumber } from "ethers";

interface Config {
  investPct: number;
  perfFeePct: number;
  multisig: string;
  minLockPeriod: number;
  AUstToUstPriceFeed: string;
}

const networkConfigs: Record<number, Config> = {
  // mainnet
  1: {
    investPct: 9000, // 90%
    perfFeePct: 300, // TODO
    multisig: "0x035F210e5d14054E8AE5A6CFA76d643aA200D56E",
    minLockPeriod: 60 * 60 * 24 * 30, // 30 days
    AUstToUstPriceFeed: "0x7b80a92f7d1e5cEeDDf939d77BF281E7e88f2906",
  },

  // ropsten
  3: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    multisig: "deployer",
    minLockPeriod: 1, // 1 second
    AUstToUstPriceFeed: "TODO",
  },

  // docker network
  1337: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    multisig: "deployer",
    minLockPeriod: 1, // 1 second
    AUstToUstPriceFeed: "TODO",
  },

  // hardhat
  31337: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    multisig: "deployer",
    minLockPeriod: 1, // 1 second
    AUstToUstPriceFeed: "TODO",
  },
};

const resolveAccount = async (account) => {
  const accounts = await getNamedAccounts();

  return accounts[account] || account;
};

export const getCurrentNetworkConfig = async () => {
  let chainId = network.config.chainId;
  if (await isRopstenFork()) {
    chainId = 3;
  }

  const config = networkConfigs[chainId];

  config.multisig = await resolveAccount(config.multisig);

  return config;
};

export const isRopstenFork = async () => {
  const code = await ethers.provider.getCode(networkConfigs[3].ethAnchorRouter);

  return BigNumber.from(code).gt(0);
};
