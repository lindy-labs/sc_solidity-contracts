import { network } from "hardhat";

interface Config {
  factoryOwner: string;
}

const configs: Record<number, Config> = {
  // mainnet
  1: {
    factoryOwner: "TODO-multisig?",
  },

  // rinkeby
  4: {
    factoryOwner: "deployer",
  },

  // docker network
  1337: {
    factoryOwner: "deployer",
  },

  // hardhat
  31337: {
    factoryOwner: "deployer",
  },
};

export default configs;

export const getCurrentConfig = () => configs[network.config.chainId];
