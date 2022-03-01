import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getCurrentNetworkConfig } from "../scripts/deployConfigs";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;

  const usdc = await get("USDC");

  const { minLockPeriod, investPct } = getCurrentNetworkConfig();

  await deploy("Vault_USDC", {
    contract: "Vault",
    from: deployer,
    log: true,
    args: [usdc.address, minLockPeriod, investPct, deployer],
  });
};

func.id = "deploy_usdc_vault";
func.tags = ["vaults", "usdc"];
func.dependencies = ["dev_setup"];

export default func;
