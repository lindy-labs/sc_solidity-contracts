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

  const vaultAddress = (await get('Vault_LUSD')).address;
  const vault = await ethers.getContractAt('Vault', vaultAddress);

  const LUSDDeployment = await get('LUSD');

  if (getNetworkName() !== 'mainnet') {
    await deploy('YearnVault', {
      contract: 'MockYearnVault',
      from: deployer,
      args: ['LUSD Yearn Vault', 'LUSD', LUSDDeployment.address],
    });
  }

  const yearnVault = await get('YearnVault');

  const args = [
    vault.address,
    owner.address,
    yearnVault.address,
    LUSDDeployment.address,
  ];

  const yearnStrategyDeployment = await deploy('YearnStrategy', {
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
    try {
      await env.run('verify:verify', {
        address: yearnStrategy.address,
        constructorArguments: args,
      });
    } catch (e) {
      console.error((e as Error).message);
    }

    await env.tenderly.persistArtifacts({
      name: 'YearnStrategy',
      address: yearnStrategy.address,
    });
  }

  await yearnStrategy
    .connect(owner)
    .grantRole(
      utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE')),
      owner.address,
    );

  console.log('manager_role granted to owner for strategy');

  await (await vault.connect(owner).setStrategy(yearnStrategy.address)).wait();
  console.log('strategy set to vault');

  if (owner.address !== multisig) {
    await (await vault.connect(owner).transferOwnership(multisig)).wait();
    console.log('ownership transfered to multisig');
  }
};

func.tags = ['strategy', 'lusd'];
func.dependencies = ['vault'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(
    ['ropsten', 'docker', 'mainnet', 'hardhat'],
    env.deployments.getNetworkName(),
  );

export default func;
