import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { ethers, network } from "hardhat";

const func: DeployFunction = async function (env) {
  await deployDevToken(env, "DAI", "MockDAI");
  await deployDevToken(env, "USDC", "MockUSDC");
  await deployDevToken(env, "UST", "MockUST");
  await deployDevToken(env, "aUST", "MockAUST");
};

async function deployDevToken(
  env: HardhatRuntimeEnvironment,
  name: string,
  contract: string
) {
  const { deployer, alice, bob, carol } = await env.getNamedAccounts();
  const { deploy, execute, getOrNull } = env.deployments;

  // skip for mainnet
  // we do this here instead of using `func.skip`
  // to allow depending on this script on vault deploys
  if (network.config.chainId == 1) {
    return;
  }

  const isDeployed = await getOrNull(name);

  await deploy(name, {
    contract,
    from: deployer,
    args: [0],
  });

  if (!isDeployed) {
    for (let account of [deployer, alice, bob, carol]) {
      await execute(
        name,
        { from: account },
        "mint",
        account,
        ethers.utils.parseUnits("1000000")
      );
    }
  }
}

func.id = "dev_setup";
func.tags = ["dev_setup"];

export default func;
