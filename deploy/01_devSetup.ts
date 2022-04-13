import type { HardhatRuntimeEnvironment } from "hardhat/types";

import { ethers } from "hardhat";
import { deployMockCurvePool } from "../deploy_helpers";

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

func.id = "dev_setup";
func.tags = ["dev_setup"];

export default func;
