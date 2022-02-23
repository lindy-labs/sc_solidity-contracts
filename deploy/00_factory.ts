import type { DeployFunction } from "hardhat-deploy/types";

import { logContract } from "../scripts/deployHelpers";
import { getCurrentConfig } from "../scripts/deployConfigs";

const func: DeployFunction = async function (env) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy } = env.deployments;

  const config = getCurrentConfig();

  const factoryOwner =
    config.factoryOwner == "deployer" ? deployer : config.factoryOwner;

  const factory = await deploy("SandclockFactory", {
    from: deployer,
    args: [factoryOwner],
  });

  logContract("SandclockFactory", factory.address);
};

func.id = "deploy_factory";
func.tags = ["SandclockFactory"];

export default func;
