import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { includes } from 'lodash';
import { ethers } from 'hardhat';
import { utils } from 'ethers';

import { getCurrentNetworkConfig } from '../scripts/deployConfigs';

import init0x from './helpers/init0x';
import initCurveRouter from './helpers/initCurveRouter';
import liquityMocks from './helpers/liquityMocks';
import verify from './helpers/verify';
import transferOwnershipToMultisig from './helpers/transferOwnership';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { get, deploy, getNetworkName } = env.deployments;
  const { multisig } = await getCurrentNetworkConfig();
  const [owner] = await ethers.getSigners();

  const vaultAddress = (await get('Liquity_DCA_Vault')).address;
  const vault = await ethers.getContractAt('Vault', vaultAddress);

  const LUSDDeployment = await get('LUSD');

  console.log('Initializing Curve Router');
  const curveRouter = await initCurveRouter(env);

  console.log('Initializing 0x');
  const swapTarget0x = await init0x(env);

  let liquityStrategyContract = includes(
    ['hardhat', 'docker'],
    getNetworkName(),
  )
    ? 'MockLiquityStrategyV3'
    : 'LiquityDCAStrategy';

  console.log('Deploying Liquity DCA Strategy');
  const liquityStrategyDeployment = await deploy('Liquity_DCA_Strategy', {
    contract: liquityStrategyContract,
    from: deployer,
    args: [],
    log: true,
  });

  const liquityStrategy = await ethers.getContractAt(
    'LiquityStrategy',
    liquityStrategyDeployment.address,
  );

  if (getNetworkName() !== 'hardhat' && getNetworkName() !== 'docker') {
    await verify(env, {
      address: liquityStrategy.address,
      constructorArguments: [],
    });

    await env.tenderly.persistArtifacts({
      name: 'Liquity_DCA_Strategy',
      address: liquityStrategy.address,
    });
  }

  if (getNetworkName() !== 'mainnet') await liquityMocks(env, 'Liquity_DCA');

  const stabilityPool = await get('Liquity_DCA_Stability_Pool');
  const LQTYDeployment = await get('LQTY');

  try {
    console.log('Initializing strategy');
    await (
      await liquityStrategy.initialize(
        vault.address,
        owner.address,
        stabilityPool.address,
        LQTYDeployment.address,
        LUSDDeployment.address,
        multisig,
        0,
        curveRouter,
      )
    ).wait();
  } catch (e) {
    console.log('Liquity_DCA_Strategy already initialized');
  }

  console.log('Granting MANAGER_ROLE to owner');
  await liquityStrategy
    .connect(owner)
    .grantRole(
      utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE')),
      owner.address,
    );

  if ((await vault.strategy()) !== liquityStrategy.address) {
    console.log('Setting strategy in vault');
    await vault.connect(owner).setStrategy(liquityStrategy.address);
  }

  console.log('Allowing swapTarget', swapTarget0x);
  await liquityStrategy.connect(owner).allowSwapTarget(swapTarget0x);

  console.log('Transferring vault to multisig');
  await transferOwnershipToMultisig(vault);

  console.log('Transferring strategy to multisig');
  await transferOwnershipToMultisig(liquityStrategy);
};

func.tags = ['liquity_dca_strategy'];
func.dependencies = ['liquity_dca_vault'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(
    ['ropsten', 'docker', 'mainnet', 'hardhat', 'goerli'],
    env.deployments.getNetworkName(),
  );

export default func;
