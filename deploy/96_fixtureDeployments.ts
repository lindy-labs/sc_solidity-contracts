import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ethers } from 'hardhat';
import { utils } from 'ethers';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { get } = env.deployments;
  const [owner, _alice, _bob, treasury] = await ethers.getSigners();

  const vaultDeployment = await get('Vault_LUSD');
  const vault = await ethers.getContractAt('Vault', vaultDeployment.address);
};

func.id = 'fixture_deployments';
func.tags = ['fixture_deployments'];
func.dependencies = ['vaults'];

// Deploy only to hardhat
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337;

export default func;
