import { BigNumber } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

async function deployMockCurvePool(
  env: HardhatRuntimeEnvironment,
  name: string,
  underlying0: string,
  otherUnderlyings: string[]
) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, execute, getOrNull, read, get } = env.deployments;

  const underlying = await get(underlying0);

  const underlyingDecimals = await read(
    underlying0,
    { from: deployer },
    "decimals"
  );

  const isDeployed = await getOrNull(name);

  if (!isDeployed) {
    await deploy(name, { contract: "MockCurve", from: deployer, args: [] });

    await execute(name, { from: deployer }, "addToken", 0, underlying.address);

    let i = 1;
    for (let tokenName of otherUnderlyings) {
      const token = await get(tokenName);
      const tokenDecimals = await read(
        tokenName,
        { from: deployer },
        "decimals"
      );

      // add token to pool
      await execute(name, { from: deployer }, "addToken", i, token.address);

      // add exchange rates from/to underlying
      await execute(
        name,
        { from: deployer },
        "updateRate",
        0,
        i,
        BigNumber.from(10).pow(18 + underlyingDecimals - tokenDecimals)
      );
      await execute(
        name,
        { from: deployer },
        "updateRate",
        i,
        0,
        BigNumber.from(10).pow(18 + tokenDecimals - underlyingDecimals)
      );
      i++;
    }
  }
}

deployMockCurvePool.skip = async (hre: HardhatRuntimeEnvironment) => true;

export default deployMockCurvePool;
