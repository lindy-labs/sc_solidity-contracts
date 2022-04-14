import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

// import { getCurrentNetworkConfig } from "../scripts/deployConfigs";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy } = env.deployments;

  await deploy("ChainlinkPriceFeed", {
    contract: "MockChainlinkPriceFeed",
    from: deployer,
    log: true,
    args: [18],
  });
};

func.id = "deploy_mock_price_feed";
func.tags = ["mock_price_feed"];
func.dependencies = ["deploy_ust_vault"];

// don't deploy to mainnet
func.skip = async (hre) => hre.network.config.chainId === 1;

export default func;
