import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ethers } from 'hardhat';
import { utils } from 'ethers';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { get, deploy } = env.deployments;
  const [owner, _alice, _bob] = await ethers.getSigners();

  const vault = await ethers.getContractAt(
    'Vault',
    (
      await get('Vault_LUSD')
    ).address,
  );

  const LUSDDeployment = await get('LUSD');

  // Deploy mock pool for ropsten and local only
  if (
    env.network.config.chainId === 3 ||
    env.network.config.chainId === 31337
  ) {
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

  if (env.network.config.chainId === 1 || env.network.config.chainId === 3) {
    try {
      await env.run('verify:verify', {
        address: yearnStrategyDeployment.address,
        constructorArguments: args,
      });
    } catch (e) {
      console.error((e as Error).message);
    }
  }

  const yearnStrategy = await ethers.getContractAt(
    'YearnStrategy',
    yearnStrategyDeployment.address,
  );

  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));
  await yearnStrategy.connect(owner).grantRole(MANAGER_ROLE, owner.address);

  const setStrategyTx = await vault.setStrategy(yearnStrategy.address);
  await setStrategyTx.wait();
};

func.id = 'yearn_strategy';
func.tags = ['strategy', 'yearn'];
func.dependencies = ['vaults'];

// don't deploy to polygon networks
func.skip = async (hre) =>
  hre.network.config.chainId === 137 || hre.network.config.chainId === 80001;

export default func;
