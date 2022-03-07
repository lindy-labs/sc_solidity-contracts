import { network, getNamedAccounts } from "hardhat";

interface Config {
  investPct: number;
  perfFeePct: number;
  multisig: string;
  minLockPeriod: number;
  ethAnchorRouter: string;
  AUstToUstPriceFeed: string;
}

const networkConfigs: Record<number, Config> = {
  // mainnet
  1: {
    investPct: 9000, // 90%
    perfFeePct: 300, // TODO
    multisig: "0x035F210e5d14054E8AE5A6CFA76d643aA200D56E",
    minLockPeriod: 60 * 60 * 24 * 30, // 30 days
    ethAnchorRouter: "0xcEF9E167d3f8806771e9bac1d4a0d568c39a9388",
    AUstToUstPriceFeed: "0x7b80a92f7d1e5cEeDDf939d77BF281E7e88f2906",
  },

  // rinkeby
  4: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    multisig: "deployer",
    minLockPeriod: 1, // 1 second
    ethAnchorRouter: "0x7537aC093cE1315BCE08bBF0bf6f9b86B7475008",
    AUstToUstPriceFeed: "TODO",
  },

  // docker network
  1337: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    multisig: "deployer",
    minLockPeriod: 1, // 1 second
    ethAnchorRouter: "TODO",
    AUstToUstPriceFeed: "TODO",
  },

  // hardhat
  31337: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    multisig: "deployer",
    minLockPeriod: 1, // 1 second
    ethAnchorRouter: "TODO",
    AUstToUstPriceFeed: "TODO",
  },
};

const resolveAccount = async (account) => {
  const accounts = await getNamedAccounts();

  return accounts[account] || account;
};

export const getCurrentNetworkConfig = async () => {
  const config = networkConfigs[network.config.chainId];

  config.multisig = await resolveAccount(config.multisig);

  return config;
};
