import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/types';

import verify from './helpers/verify';
import { getCurrentNetworkConfig } from '../scripts/deployConfigs';

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy } = env.deployments;

  const { multisig } = await getCurrentNetworkConfig();
  const owner = multisig;

  const args = [owner];

  const donationsDeployment = await deploy('Donations', {
    contract: 'Donations',
    from: deployer,
    log: true,
    args,
  });

  if (process.env.NODE_ENV !== 'test')
    await env.tenderly.persistArtifacts({
      name: 'Donations',
      address: donationsDeployment.address,
    });

  if (
    env.network.config.chainId === 80001 ||
    env.network.config.chainId === 137
  ) {
    await verify(env, {
      address: donationsDeployment.address,
      constructorArguments: args,
    });
  }
};

// deploy to polygon mainnet, polygon mumbai and local node only
func.skip = async (hre) =>
  hre.network.config.chainId != 137 &&
  hre.network.config.chainId != 80001 &&
  hre.network.config.chainId != 31337;

func.tags = ['donations'];

export default func;
