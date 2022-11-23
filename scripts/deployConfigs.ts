import { network, getNamedAccounts } from 'hardhat';
import { Address } from 'hardhat-deploy/types';

interface Config {
  investPct?: number;
  perfFeePct?: number;
  lossTolerancePct?: number;
  multisig: string;
  deploymentAddress: string;
  minLockPeriod?: number;
}

const networkConfigs: Record<number, Config> = {
  // mainnet
  1: {
    investPct: 9000, // 90%
    perfFeePct: 0,
    lossTolerancePct: 200,
    multisig: '0x035F210e5d14054E8AE5A6CFA76d643aA200D56E',
    deploymentAddress: '0x84f67f75DAf6D57Aef500E0c85C77B7b3bBc92A9',
    minLockPeriod: 60 * 60 * 24 * 90, // 90 days
  },

  // goerli
  5: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    lossTolerancePct: 200,
    multisig: '0xCfF577D4072BF126Cdd73CDC7353637A1Fa5f4CE',
    deploymentAddress: '0xCfF577D4072BF126Cdd73CDC7353637A1Fa5f4CE',
    minLockPeriod: 1, // 1 second
  },

  // docker network
  1337: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    lossTolerancePct: 200,
    multisig: '0xCfF577D4072BF126Cdd73CDC7353637A1Fa5f4CE',
    deploymentAddress: '0xCfF577D4072BF126Cdd73CDC7353637A1Fa5f4CE',
    minLockPeriod: 1, // 1 second
  },

  // hardhat
  31337: {
    investPct: 9000, // 90%
    perfFeePct: 100, // 1%
    lossTolerancePct: 200,
    multisig: '0xCfF577D4072BF126Cdd73CDC7353637A1Fa5f4CE',
    deploymentAddress: '0xCfF577D4072BF126Cdd73CDC7353637A1Fa5f4CE',
    minLockPeriod: 1, // 1 second
  },

  // polygon mumbai
  80001: {
    multisig: '0x8f592F2594C43eA30879f9fbED4d930248D81D41',
    deploymentAddress: '0x8f592F2594C43eA30879f9fbED4d930248D81D41',
  },

  // polygon mainnet
  137: {
    multisig: '0xf500Ea3Af480E97a85d49ffcD75AEDaFF3523Db9',
    deploymentAddress: '0x8f592F2594C43eA30879f9fbED4d930248D81D41',
  },
};

const resolveAccount = async (account: Address) => {
  const accounts = await getNamedAccounts();

  return accounts[account] || account;
};

export const getCurrentNetworkConfig = async () => {
  const config = networkConfigs[network.config.chainId];

  config.multisig = await resolveAccount(config.multisig);

  return config;
};
