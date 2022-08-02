import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { includes } from 'lodash';
import { ethers } from 'hardhat';
import { utils } from 'ethers';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { get, deploy, getNetworkName } = env.deployments;
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

  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));
  await yearnStrategy.connect(owner).grantRole(MANAGER_ROLE, owner.address);

  const setStrategyTx = await vault.setStrategy(yearnStrategy.address);
  await setStrategyTx.wait();
};

func.tags = ['strategy', 'lusd'];
func.dependencies = ['vault'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(
    ['ropsten', 'docker', 'mainnet', 'hardhat'],
    env.deployments.getNetworkName(),
  );

export default func;
