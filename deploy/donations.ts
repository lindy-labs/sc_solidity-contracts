import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/types';

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

  if (env.network.config.chainId === 1 || env.network.config.chainId === 3) {
    try {
      await env.run('verify:verify', {
        address: donationsDeployment.address,
        constructorArguments: args,
      });
    } catch (e) {
      console.error((e as Error).message);
    }
  }
};

func.id = 'deploy_donations';
func.tags = ['donations'];
func.dependencies = ['dev_setup', 'deploy_ust_vault'];

export default func;
