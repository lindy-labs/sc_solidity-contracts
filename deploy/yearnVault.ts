import { ethers } from 'hardhat';
import { includes } from 'lodash';

import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import deployMockCurvePool from './helpers/mockPool';
import { getCurrentNetworkConfig } from '../scripts/deployConfigs';
import verify from './helpers/verify';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { get, deploy, getNetworkName } = env.deployments;

  const lusd = await get('LUSD');
  const dai = await get('DAI');
  const usdc = await get('USDC');

  if (getNetworkName() !== 'mainnet') {
    await deployMockCurvePool(env, 'CurvePool-LUSD-3CRV', 'LUSD', [
      'DAI',
      'USDC',
    ]);
  }

  const curvePool = await get('CurvePool-LUSD-3CRV');

  const {
    minLockPeriod,
    investPct,
    perfFeePct,
    lossTolerancePct,
    multisig,
    deploymentAddress,
  } = await getCurrentNetworkConfig();

  const treasury = multisig;
  const owner = deploymentAddress;

  const args = [
    lusd.address,
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
    0,
  ];

  const vault = await deploy('Yearn_LUSD_Vault', {
    contract: 'Vault',
    from: deployer,
    log: true,
    args,
  });

  if (getNetworkName() !== 'hardhat' && getNetworkName() !== 'docker') {
    await verify(env, {
      address: vault.address,
      constructorArguments: args,
    });

    await env.tenderly.persistArtifacts({
      name: 'Yearn_LUSD_Vault',
      address: vault.address,
    });
  }

  return ethers.getContractAt('Vault', vault.address);
}
func.tags = ['yearn_lusd_vault', 'vault'];
func.dependencies = ['dev'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(
    ['goerli', 'docker', 'mainnet', 'hardhat'],
    env.deployments.getNetworkName(),
  );

export default func;
