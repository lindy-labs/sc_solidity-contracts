import type { HardhatRuntimeEnvironment } from "hardhat/types";

import { ethers } from "hardhat";
import { BigNumber } from "ethers";

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  if (env.network.live) {
    return;
  }

  await deployDevToken(env, "DAI", "MockDAI");
  await deployDevToken(env, "USDC", "MockUSDC");
  await deployDevToken(env, "UST", "MockUST");
  await deployDevToken(env, "aUST", "MockAUST");
  await deployMockCurvePool(env, "CurvePool-UST-3CRV", "UST", ["DAI", "USDC"]);
};

async function deployDevToken(
  env: HardhatRuntimeEnvironment,
  name: string,
  contract: string
) {
  const { deployer, alice, bob, carol } = await env.getNamedAccounts();
  const { deploy, execute, getOrNull, read } = env.deployments;

  const isDeployed = await getOrNull(name);

  if (!isDeployed) {
    await deploy(name, {
      contract,
      from: deployer,
      args: [0],
    });

    for (let account of [deployer, alice, bob, carol]) {
      const decimals = await read(name, "decimals");
      await execute(
        name,
        { from: account },
        "mint",
        account,
        parseUnits("1000", decimals)
      );
    }
  }
}

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

func.id = "dev_setup";
func.tags = ["dev_setup"];

export default func;
