import type { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async function (env: HardhatRuntimeEnvironment) {
  if (env.network.live) {
    return;
  }

  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;

  const UST = await get("UST");
  const aUST = await get("aUST");

  await deploy("MockEthAnchorRouter", {
    contract: "MockEthAnchorRouter",
    from: deployer,
    args: [UST.address, aUST.address],
  });

  await deploy("MockaUSTUSTPriceFeed", {
    contract: "MockChainlinkPriceFeed",
    from: deployer,
    args: [18],
  });
};

func.id = "mocks";
func.dependencies = ["dev_setup"];
func.tags = ["mocks"];

export default func;
