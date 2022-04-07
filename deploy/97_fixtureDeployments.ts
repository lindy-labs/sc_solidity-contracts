import type { HardhatRuntimeEnvironment } from "hardhat/types";

import { ethers } from "hardhat";

const func = async function (env: HardhatRuntimeEnvironment) {
  if (env.network.live) {
    return;
  }

  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;
  const [owner] = await ethers.getSigners();

  const mockUST = await get("UST");

  const mockaUSTDeployment = await get("aUST");
  const mockaUST = await ethers.getContractAt(
    "MockERC20",
    mockaUSTDeployment.address
  );

  const mockEthAnchorRouterDeployment = await deploy("MockEthAnchorRouter", {
    contract: "MockEthAnchorRouter",
    from: deployer,
    args: [mockUST.address, mockaUST.address],
  });

  const vaultDeployment = await get("Vault_UST");
  const vault = await ethers.getContractAt("Vault", vaultDeployment.address);

  const mockChainlinkPriceFeedDeployment = await deploy(
    "MockChainlinkPriceFeed",
    {
      contract: "MockChainlinkPriceFeed",
      from: deployer,
      args: [18],
    }
  );

  await deploy("AnchorUSTStrategy", {
    contract: "AnchorUSTStrategy",
    from: deployer,
    args: [
      vault.address,
      mockEthAnchorRouterDeployment.address,
      mockChainlinkPriceFeedDeployment.address,
      mockUST.address,
      mockaUSTDeployment.address,
      owner.address,
    ],
    log: true,
  });
};

func.id = "fixture_deployments";
func.tags = ["fixture_deployments"];
func.dependencies = ["vaults"];

// Deploy only to hardhat
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337;

export default func;
