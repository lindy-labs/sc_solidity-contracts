import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getCurrentNetworkConfig } from "../scripts/deployConfigs";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;

  const ust = await get("UST");
  const aust = await get("AUST");
  const vault = await get("Vault_UST");

  const { multisig, ethAnchorRouter, perfFeePct } = getCurrentNetworkConfig();

  const treasury = env.network.config.chainId == 1 ? multisig : deployer;
  const owner = env.network.config.chainId == 1 ? multisig : deployer;

  await deploy("Vault_UST_AnchorStrategy", {
    contract: "AnchorUSTStrategy",
    from: deployer,
    log: true,
    args: [
      vault.address,
      treasury,
      ethAnchorRouter,
      ust.address,
      aust.address,
      perfFeePct,
      owner,
    ],
  });
};

func.id = "deploy_ust_anchor_strategy";
func.tags = ["strategies", "ust"];
func.dependencies = ["deploy_ust_vault"];

// deploy only to mainnet
func.skip = async (hre) => hre.network.config.chainId != 1;

export default func;
