import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getCurrentNetworkConfig } from "../scripts/deployConfigs";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;

  const ust = await get("UST");
  const aust = await get("aUST");
  const vault = await get("Vault_UST");

  const { multisig, ethAnchorRouter } = await getCurrentNetworkConfig();

  const treasury = env.network.config.chainId == 1 ? multisig : deployer;
  const owner = env.network.config.chainId == 1 ? multisig : deployer;

  const MockChainlinkPriceFeedFactory = await deploy("MockChainlinkPriceFeed", {
    contract: "MockChainlinkPriceFeed",
    from: deployer,
    log: true,
    args: [18],
  });

  await deploy("Vault_UST_AnchorStrategy", {
    contract: "AnchorStrategy",
    from: deployer,
    log: true,
    args: [
      vault.address,
      ethAnchorRouter,
      MockChainlinkPriceFeedFactory.address,
      ust.address,
      aust.address,
      owner,
    ],
  });
};

func.id = "deploy_ust_anchor_strategy";
func.tags = ["strategies", "ust"];
func.dependencies = ["deploy_ust_vault"];

// don't deploy to local networks
func.skip = async (hre) =>
  hre.network.config.chainId != 1 && hre.network.config.chainId != 3;

export default func;
