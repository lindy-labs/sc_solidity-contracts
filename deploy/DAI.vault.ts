import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getCurrentNetworkConfig } from "../scripts/deployConfigs";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;

  const dai = await get("DAI");

  const { minLockPeriod, investPct } = getCurrentNetworkConfig();

  await deploy("Vault_DAI", {
    contract: "Vault",
    from: deployer,
    log: true,
    args: [dai.address, minLockPeriod, investPct, deployer],
  });
};

func.id = "deploy_dai_vault";
func.tags = ["vaults", "dai"];
func.dependencies = ["dev_setup"];

export default func;
