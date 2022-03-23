import type { HardhatRuntimeEnvironment } from "hardhat/types";

import { ethers } from "hardhat";
import { BigNumber } from "ethers";

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  if (env.network.live) {
    return;
  }

  await deployUSTStrategyDependencies(env);
};

async function deployUSTStrategyDependencies(env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, execute, get, read } = env.deployments;
  const [owner, alice, bob, treasury] = await ethers.getSigners();

  console.table([alice, bob, treasury]);

  const mockUST = await get("UST");
  const mockaUST = await get("aUST");

  await deploy("MockEthAnchorRouter", {
    contract: "MockEthAnchorRouter",
    from: deployer,
    log: true,
    args: [mockUST.address, mockUST.address],
  });

  await deploy("MockChainlinkPriceFeed", {
    contract: "MockChainlinkPriceFeed",
    from: deployer,
    log: true,
    args: [18],
  });

  console.log("deployed UST strategy dependencies");

  const vault = await get("Vault_UST");
  const mockEthAnchorRouter = await get("MockEthAnchorRouter");
  const mockChainlinkPriceFeed = await get("MockChainlinkPriceFeed");

  const args = [
    vault.address,
    mockEthAnchorRouter.address,
    mockChainlinkPriceFeed.address,
    mockUST.address,
    mockaUST.address,
    owner.address,
  ];

  console.log("args", args);

  await deploy("AnchorUSTStrategy", {
    contract: "AnchorUSTStrategy",
    from: deployer,
    log: true,
    args,
  });
}

func.id = "devStrategy";
func.tags = ["devStrategies"];
func.dependencies = ["vaults", "strategies"];

export default func;
