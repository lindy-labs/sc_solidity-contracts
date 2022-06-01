import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/types';

import { getCurrentNetworkConfig } from '../scripts/deployConfigs';

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;

  const ust = await get('UST');
  const aust = await get('aUST');
  const vault = await get('Vault_UST');

  const { multisig, ethAnchorRouter } = await getCurrentNetworkConfig();

  const owner = env.network.config.chainId == 1 ? multisig : deployer;

  const chainLinkPriceFeed = await get('ChainlinkPriceFeed');

  const args = [
    vault.address,
    ethAnchorRouter,
    chainLinkPriceFeed.address,
    ust.address,
    aust.address,
    owner,
  ];

  const strategyDeployment = await deploy('Vault_UST_AnchorStrategy', {
    contract: 'AnchorStrategy',
    from: deployer,
    log: true,
    args,
  });

  if (env.network.config.chainId === 1 || env.network.config.chainId === 3) {
    try {
      await env.run('verify:verify', {
        address: strategyDeployment.address,
        constructorArguments: args,
      });
    } catch (e) {
      console.error((e as Error).message);
    }
  }
};

func.id = 'deploy_ust_anchor_strategy';
func.tags = ['strategies', 'ust'];
func.dependencies = ['deploy_ust_vault', 'mock_price_feed'];

// deploy only to mainnet or ropsten
func.skip = async (hre) =>
  hre.network.config.chainId != 1 && hre.network.config.chainId != 3;

export default func;
