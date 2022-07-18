import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ethers } from 'hardhat';

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  if (env.network.config.chainId === 31337) {
    await deployDevToken(env, 'DAI', 'MockDAI');
    await deployDevToken(env, 'USDC', 'MockUSDC');
  }

  await deployDevToken(env, 'LUSD', 'MockLUSD');
};

async function deployDevToken(
  env: HardhatRuntimeEnvironment,
  name: string,
  contract: string,
) {
  const { deployer, alice, bob, carol } = await env.getNamedAccounts();
  const { deploy, execute, getOrNull, read } = env.deployments;

  const isDeployed = await getOrNull(name);

  if (!isDeployed) {
    const deployment = await deploy(name, {
      contract,
      from: deployer,
      args: [0],
      log: true,
    });

    if (process.env.NODE_ENV !== 'test')
      await env.tenderly.persistArtifacts({
        name,
        address: deployment.address,
      });

    if (process.env.NODE_ENV !== 'test') {
      for (let account of [deployer, alice, bob, carol]) {
        const decimals = await read(name, 'decimals');
        await execute(
          name,
          { from: account },
          'mint',
          account,
          parseUnits('100000', decimals),
        );
      }
    }
  }
}

// Deploy only to hardhat and ropsten
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337 && hre.network.config.chainId != 3;

func.id = 'dev_setup';
func.tags = ['dev_setup'];

export default func;
