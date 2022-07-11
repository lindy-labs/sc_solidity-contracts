import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ethers } from 'hardhat';
import deployDevToken from './helpers/devToken';

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  if (env.network.config.chainId === 31337) {
    await deployDevToken(env, 'DAI', 'MockDAI');
    await deployDevToken(env, 'USDC', 'MockUSDC');
  }

  await deployDevToken(env, 'LUSD', 'MockLUSD');
};

// Deploy only to hardhat and ropsten
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337 && hre.network.config.chainId != 3;

func.id = 'dev_setup';
func.tags = ['dev_setup'];

export default func;
