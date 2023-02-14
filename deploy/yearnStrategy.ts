import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { includes } from 'lodash';
import { ethers } from 'hardhat';
import { utils } from 'ethers';

import verify from './helpers/verify';
import { getCurrentNetworkConfig } from '../scripts/deployConfigs';
import deployMockCurvePool from './helpers/mockPool';

async function deployVault(env: HardhatRuntimeEnvironment) {
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

const func = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { get, deploy, getNetworkName } = env.deployments;
  const [admin] = await ethers.getSigners();

  const { multisig } = await getCurrentNetworkConfig();

  const vault = await deployVault(env);

  const lusd = await get('LUSD');

  if (getNetworkName() !== 'mainnet') {
    await deploy('YearnVault', {
      contract: 'MockYearnVault',
      from: deployer,
      args: ['LUSD Yearn Vault', 'LUSD', lusd.address],
    });
  }

  const yearnVault = await get('YearnVault');

  const args = [vault.address, admin.address, yearnVault.address, lusd.address];

  const yearnStrategyDeployment = await deploy('Yearn_LUSD_Strategy', {
    contract: 'YearnStrategy',
    from: deployer,
    args,
    log: true,
  });

  const yearnStrategy = await ethers.getContractAt(
    'YearnStrategy',
    yearnStrategyDeployment.address,
  );

  if (getNetworkName() !== 'hardhat' && getNetworkName() !== 'docker') {
    await verify(env, {
      address: yearnStrategy.address,
      constructorArguments: args,
    });

    await env.tenderly.persistArtifacts({
      name: 'Yearn_LUSD_Strategy',
      address: yearnStrategy.address,
    });
  }

  console.log('Grant MANAGER_ROLE to admin');
  await (
    await yearnStrategy
      .connect(admin)
      .grantRole(
        utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE')),
        admin.address,
        {
          gasPrice: 34633000000,
        },
      )
  ).wait();
  console.log('MANAGER_ROLE granted to the admin of the strategy');

  console.log('Setting strategy in vault');
  await (await vault.connect(admin).setStrategy(yearnStrategy.address)).wait();
  console.log('Strategy set');

  if (admin.address !== multisig) {
    await (await vault.connect(admin).transferAdminRights(multisig)).wait();
    console.log('Admin rights transfered to multisig');
  }
};

func.tags = ['yearn_lusd'];
func.dependencies = ['dev'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(
    ['goerli', 'docker', 'mainnet', 'hardhat'],
    env.deployments.getNetworkName(),
  );

export default func;
