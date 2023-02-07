import { BigNumber } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

async function deployMockCurvePool(
  env: HardhatRuntimeEnvironment,
  name: string,
  underlying0: string,
  otherUnderlyings: string[],
) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, execute, getOrNull, read, get } = env.deployments;

  const underlying = await get(underlying0);

  const underlyingDecimals = await read(
    underlying0,
    { from: deployer },
    'decimals',
  );

  if (await getOrNull(name)) {
    return;
  }

  const deployment = await deploy(name, {
    contract: 'MockCurve',
    from: deployer,
    args: [],
  });

  if (process.env.NODE_ENV !== 'test')
    await env.tenderly.persistArtifacts({
      name: 'MockCurve',
      address: deployment.address,
    });

  await execute(name, { from: deployer }, 'addToken', 0, underlying.address);

  for (let i = 1; i <= otherUnderlyings.length; i++) {
    const tokenName = otherUnderlyings[i-1];
    const token = await get(tokenName);
    const tokenDecimals = await read(tokenName, { from: deployer }, 'decimals');

    // add token to pool
    await execute(name, { from: deployer }, 'addToken', i, token.address);

    // add exchange rates from/to underlying
    await execute(
      name,
      { from: deployer },
      'updateRate',
      0,
      i,
      BigNumber.from(10).pow(18 + underlyingDecimals - tokenDecimals),
    );

    await execute(
      name,
      { from: deployer },
      'updateRate',
      i,
      0,
      BigNumber.from(10).pow(18 + tokenDecimals - underlyingDecimals),
    );
  }
}

deployMockCurvePool.skip = async (hre: HardhatRuntimeEnvironment) => true;

export default deployMockCurvePool;
