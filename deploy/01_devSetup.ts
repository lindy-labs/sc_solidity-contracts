import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { includes } from 'lodash';
import { ethers } from 'hardhat';

import verify from './helpers/verify';

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  if (
    includes(['docker', 'hardhat', 'goerli'], env.deployments.getNetworkName())
  ) {
    await deployDevToken(env, 'DAI', 'MockDAI');
    await deployDevToken(env, 'USDC', 'MockUSDC');
    await deployDevToken(env, 'LQTY', 'MockLQTY');
    await deployDevToken(env, 'LUSD', 'MockLUSD');
  }
};

async function deployDevToken(
  env: HardhatRuntimeEnvironment,
  name: string,
  contract: string,
) {
  const { deployer, alice, bob, carol } = await env.getNamedAccounts();
  const { deploy, execute, getOrNull, read, getNetworkName } = env.deployments;

  const isDeployed = await getOrNull(name);

  if (isDeployed && !includes(['hardhat', 'docker'], getNetworkName())) {
    await verify(env, {
      address: isDeployed.address,
      constructorArguments: [0],
      contract: `contracts/mock/MockERC20.sol:${contract}`,
    });

    return;
  }

  const deployment = await deploy(name, {
    contract,
    from: deployer,
    args: [0],
    log: true,
  });

  if (getNetworkName() !== 'hardhat' && getNetworkName() !== 'docker') {
    await env.tenderly.persistArtifacts({
      name,
      address: deployment.address,
    });

    await verify(env, {
      address: deployment.address,
      constructorArguments: [0],
      contract: `contracts/mock/MockERC20.sol:${contract}`,
    });
  }

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

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(['docker', 'hardhat', 'goerli'], env.deployments.getNetworkName());

func.tags = ['dev'];

export default func;
