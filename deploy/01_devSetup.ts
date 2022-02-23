import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { ethers } from "hardhat";

const func: DeployFunction = async function (env) {
  await deployDevToken(env, "USDC");
  await deployDevToken(env, "DAI");
  await deployDevToken(env, "UST");
};

async function deployDevToken(env: HardhatRuntimeEnvironment, name: string) {
  const { deployer, alice, bob, carol } = await env.getNamedAccounts();
  const { deploy, execute } = env.deployments;

  await deploy(name, {
    from: deployer,
    contract: "MockERC20",
    args: [0],
  });

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

func.id = "deploy_mock_tokens";
func.tags = ["MockTokens"];

// run this only on local networks
func.skip = async (env) => env.network.live;

export default func;
