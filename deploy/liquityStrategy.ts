import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { includes } from 'lodash';
import { ethers } from 'hardhat';
import { utils } from 'ethers';
import { getCurrentNetworkConfig } from '../scripts/deployConfigs';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { get, deploy, getNetworkName } = env.deployments;
  const { multisig } = await getCurrentNetworkConfig();
  const [owner] = await ethers.getSigners();

  const vaultAddress = (await get('Vault_Liquity')).address;
  const vault = await ethers.getContractAt('Vault', vaultAddress);

  const LUSDDeployment = await get('LUSD');

  let liquityStrategyContract = 'LiquityStrategy';
  if (getNetworkName() === 'hardhat' || getNetworkName() === 'docker') {
    liquityStrategyContract = 'MockLiquityStrategyV3';
  }
  const liquityStrategyDeployment = await deploy('LiquityStrategy', {
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
    try {
      await env.run('verify:verify', {
        address: liquityStrategy.address,
        constructorArguments: [],
      });
    } catch (e) {
      console.error((e as Error).message);
    }

    await env.tenderly.persistArtifacts({
      name: 'LiquityStrategy',
      address: liquityStrategy.address,
    });
  }

  if (getNetworkName() !== 'mainnet') {
    const mockLiquityPriceFeedDeployment = await deploy('LiquityPriceFeed', {
      contract: 'MockLiquityPriceFeed',
      from: deployer,
      log: true,
      args: [],
    });

    await deploy('LiquityStabilityPool', {
      contract: 'MockStabilityPool',
      from: deployer,
      args: [LUSDDeployment.address, mockLiquityPriceFeedDeployment.address],
      log: true,
    });
  }

  const stabilityPool = await get('LiquityStabilityPool');
  const LQTYDeployment = await get('LQTY');

  // initialize strategy
  await (
    await liquityStrategy.initialize(
      vault.address,
      owner.address,
      stabilityPool.address,
      LQTYDeployment.address,
      LUSDDeployment.address,
      multisig,
    )
  ).wait();

  console.log('LquityStrategy initialized');

  // set manager role
  await liquityStrategy
    .connect(owner)
    .grantRole(
      utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE')),
      owner.address,
    );

  console.log('manager_role granted to owner for strategy');

  await vault.connect(owner).setStrategy(liquityStrategy.address);
  console.log('strategy set to vault');

  if (owner.address !== multisig) {
    await (await vault.connect(owner).transferAdminRights(multisig)).wait();
    console.log('vault ownership transfered to multisig');

    await (
      await liquityStrategy.connect(owner).transferAdminRights(multisig)
    ).wait();
    console.log('strategy ownership transfered to multisig');
  }
};

func.tags = ['strategy', 'custom_liquity'];
func.dependencies = ['vault'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(
    ['ropsten', 'docker', 'mainnet', 'hardhat'],
    env.deployments.getNetworkName(),
  );

export default func;
