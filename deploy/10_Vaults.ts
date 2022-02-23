import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getCurrentNetworkConfig } from "../scripts/deployConfigs";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { get } = env.deployments;

  const ust = await get("UST");
  const usdc = await get("USDC");
  const dai = await get("DAI");

  const { minLockPeriod } = getCurrentNetworkConfig();

  await deployVault(env, "Vault_UST", ust.address, minLockPeriod);
  await deployVault(env, "Vault_USDC", usdc.address, minLockPeriod);
  await deployVault(env, "Vault_DAI", dai.address, minLockPeriod);
};

async function deployVault(
  env: HardhatRuntimeEnvironment,
  name: string,
  underlyingAddr: string,
  minLockPeriod: number
) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy } = env.deployments;

  const investPct = 9000; // 90%

  await deploy(name, {
    contract: "Vault",
    from: deployer,
    log: true,
    args: [underlyingAddr, minLockPeriod, investPct, deployer],
  });
}

func.id = "deploy_vaults";
func.tags = ["Vaults"];

export default func;
