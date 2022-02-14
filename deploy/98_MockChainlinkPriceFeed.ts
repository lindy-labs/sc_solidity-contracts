import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy },
    getNamedAccounts,
  } = env;

  const { deployer } = await getNamedAccounts();

  await deploy("MockChainlinkPriceFeed", {
    from: deployer,
    args: [18],
    log: true,
  });
};

func.tags = ["MockChainlinkPriceFeed"];

export default func;
