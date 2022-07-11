import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

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

deployDevToken.skip = async (hre: HardhatRuntimeEnvironment) => true;

export default deployDevToken;
