import { network } from "hardhat";

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
    perfFeePct: 0, // TODO
    multisig: "TODO",
    minLockPeriod: 60 * 60 * 24 * 30, // 30 days
    ethAnchorRouter: "0xcEF9E167d3f8806771e9bac1d4a0d568c39a9388",
    AUstToUstPriceFeed: "0x7b80a92f7d1e5cEeDDf939d77BF281E7e88f2906",
  },

  // rinkeby
  4: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    multisig: "TODO",
    minLockPeriod: 1, // 1 second
    ethAnchorRouter: "0x7537aC093cE1315BCE08bBF0bf6f9b86B7475008",
    AUstToUstPriceFeed: "TODO",
  },

  // docker network
  1337: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    multisig: "TODO",
    minLockPeriod: 1, // 1 second
    ethAnchorRouter: "TODO",
    AUstToUstPriceFeed: "TODO",
  },

  // hardhat
  31337: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    multisig: "TODO",
    minLockPeriod: 1, // 1 second
    ethAnchorRouter: "TODO",
    AUstToUstPriceFeed: "TODO",
  },
};

export default networkConfigs;

export const getCurrentNetworkConfig = () =>
  networkConfigs[network.config.chainId];
