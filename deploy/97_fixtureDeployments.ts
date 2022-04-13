import type { HardhatRuntimeEnvironment } from "hardhat/types";

import { ethers } from "hardhat";
import { utils } from "ethers";

const func = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;
  const [owner, _alice, _bob, treasury] = await ethers.getSigners();

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

  const anchorStrategyDeployment = await deploy("AnchorStrategy", {
    contract: "AnchorStrategy",
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

  const anchorStrategy = await ethers.getContractAt(
    "AnchorStrategy",
    anchorStrategyDeployment.address
  );

  // Configure contract roles
  console.log("Configuring strategy contract role");
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes("MANAGER_ROLE"));
  await anchorStrategy.connect(owner).grantRole(MANAGER_ROLE, owner.address);

  console.log("Configuring vault strategy, treasury and investPct");
  await vault.connect(owner).setTreasury(treasury.address);
  await vault.connect(owner).setInvestPct("8000");
  const setStrategyTx = await vault.setStrategy(anchorStrategy.address);
  await setStrategyTx.wait();
};

func.id = "fixture_deployments";
func.tags = ["fixture_deployments"];
func.dependencies = ["vaults"];

// Deploy only to hardhat
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337;

export default func;
