import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ethers } from 'hardhat';
import { utils } from 'ethers';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;
  const [owner, _alice, _bob, treasury] = await ethers.getSigners();

  const vaultDeployment = await get('Vault_UST');
  const vault = await ethers.getContractAt('Vault', vaultDeployment.address);

  // Configure contract roles
  console.log('Configuring contract roles');
  const SPONSOR_ROLE = utils.keccak256(utils.toUtf8Bytes('SPONSOR_ROLE'));
  await vault.connect(owner).grantRole(SPONSOR_ROLE, treasury.address);

  console.log('Configuring vault strategy, treasury and investPct');
  await vault.connect(owner).setTreasury(treasury.address);
  await vault.connect(owner).setInvestPct('8000');
};

func.id = 'fixture_deployments';
func.tags = ['fixture_deployments'];
func.dependencies = ['vaults'];

// Deploy only to hardhat
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337;

export default func;
