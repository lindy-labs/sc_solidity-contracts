import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getCurrentNetworkConfig } from "../scripts/deployConfigs";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;

  const ust = await get("UST");

  const { minLockPeriod, investPct } = getCurrentNetworkConfig();

  await deploy("Vault_UST", {
    contract: "Vault",
    from: deployer,
    log: true,
    args: [ust.address, minLockPeriod, investPct, deployer],
  });
};

func.id = "deploy_ust_vault";
func.tags = ["vaults", "ust"];
func.dependencies = ["dev_setup"];

export default func;
