import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/types';

import { getCurrentNetworkConfig } from '../scripts/deployConfigs';
import deployMockCurvePool from './helpers/mockPool';

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;

  const ust = await get('UST');
  const dai = await get('DAI');
  const usdc = await get('USDC');

  // Deploy mock pool for ropsten only
  if (env.network.config.chainId === 3) {
    await deployMockCurvePool(env, 'CurvePool-UST-3CRV', 'UST', [
      'DAI',
      'USDC',
    ]);
  }

  const curvePool = await get('CurvePool-UST-3CRV');

  const { minLockPeriod, investPct, perfFeePct, lossTolerancePct, multisig } =
    await getCurrentNetworkConfig();
  const treasury = multisig;
  const owner = multisig;

  const args = [
    ust.address,
    minLockPeriod,
    investPct,
    treasury,
    owner,
    perfFeePct,
    lossTolerancePct,
    [
      {
        token: dai.address,
        pool: curvePool.address,
        tokenI: 1,
        underlyingI: 0,
      },
      {
        token: usdc.address,
        pool: curvePool.address,
        tokenI: 2,
        underlyingI: 0,
      },
    ],
  ];

  const vaultDeployment = await deploy('Vault_UST', {
    contract: 'Vault',
    from: deployer,
    log: true,
    args,
  });

  if (process.env.NODE_ENV !== 'test')
    await env.tenderly.persistArtifacts({
      name: 'Vault_UST',
      address: vaultDeployment.address,
    });

  if (env.network.config.chainId === 1 || env.network.config.chainId === 3) {
    try {
      await env.run('verify:verify', {
        address: vaultDeployment.address,
        constructorArguments: args,
      });
    } catch (e) {
      console.error((e as Error).message);
    }
  }
};

// don't deploy to polygon networks
func.skip = async (hre) =>
  hre.network.config.chainId === 137 || hre.network.config.chainId === 80001;

func.id = 'deploy_ust_vault';
func.tags = ['vaults', 'ust'];
func.dependencies = ['dev_setup'];

export default func;
