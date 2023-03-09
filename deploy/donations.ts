import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/types';

import verify from './helpers/verify';
import { getCurrentNetworkConfig } from '../scripts/deployConfigs';
import { includes } from 'lodash';

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

  if (includes(['polygon', 'mumbai'], env.deployments.getNetworkName())) {
    await verify(env, {
      address: donationsDeployment.address,
      constructorArguments: args,
    });
  }
};

// deploy to polygon mainnet, polygon mumbai and local node only
func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(
    ['mumbai', 'polygon', 'docker', 'hardhat'],
    env.deployments.getNetworkName(),
  );

func.tags = ['donations'];

export default func;
