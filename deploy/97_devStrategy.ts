import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  if (env.network.live) {
    return;
  }

  await deployUSTStrategyDependencies(env);
};

async function deployUSTStrategyDependencies(env: HardhatRuntimeEnvironment) {
  const { deployer, ethAnchorOperator } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;
  const [owner, alice, bob, treasury] = await ethers.getSigners();

  console.table([alice, bob, treasury]);

  const mockUST = await get("UST");
  const underlying = await ethers.getContractAt("MockERC20", mockUST.address);

  const mockaUST = await get("aUST");

  await deploy("MockEthAnchorRouter", {
    contract: "MockEthAnchorRouter",
    from: deployer,
    args: [mockUST.address, mockUST.address],
  });

  await deploy("MockChainlinkPriceFeed", {
    contract: "MockChainlinkPriceFeed",
    from: deployer,
    args: [18],
  });

  console.log("Deployed UST strategy dependencies");

  const vaultDeployment = await get("Vault_UST");
  const vault = await ethers.getContractAt("Vault", vaultDeployment.address);
  const mockEthAnchorRouterDeployment = await get("MockEthAnchorRouter");
  const mockChainlinkPriceFeed = await get("MockChainlinkPriceFeed");

  const mockEthAnchorRouter = await ethers.getContractAt(
    "MockEthAnchorRouter",
    mockEthAnchorRouterDeployment.address
  );
  await mockEthAnchorRouter.addPendingOperator(ethAnchorOperator);

  console.log("Deploy AnchorUSTStrategy for development");

  await deploy("AnchorUSTStrategy", {
    contract: "AnchorUSTStrategy",
    from: deployer,
    args: [
      vault.address,
      mockEthAnchorRouterDeployment.address,
      mockChainlinkPriceFeed.address,
      mockUST.address,
      mockaUST.address,
      owner.address,
    ],
  });

  await underlying.mint(alice.address, parseUnits("5000", 18));
  await underlying.mint(bob.address, parseUnits("5000", 18));

  await Promise.all(
    [alice, bob, treasury, owner].map((account) =>
      underlying.connect(account).approve(vault.address, parseUnits("5000", 18))
    )
  );

  const ustAnchorStrategyAddress = (await get("AnchorUSTStrategy")).address;
  const ustAnchorStrategy = await ethers.getContractAt(
    "AnchorUSTStrategy",
    ustAnchorStrategyAddress
  );

  console.log("Set treasury for UST vault");
  await vault.connect(owner).setTreasury(treasury.address);

  console.log("The treasury sponsors 1000 to UST Vault");
  const lockUntil = await vault.MIN_SPONSOR_LOCK_DURATION();
  await vault.connect(treasury).sponsor(parseUnits("1000", 18), lockUntil);

  console.log("Alice deposits into UST vault");
  await vault.connect(alice).deposit({
    amount: parseUnits("1000", 18),
    lockDuration: 1,
    claims: [
      {
        beneficiary: alice.address,
        pct: 10000,
        data: "0x",
      },
    ],
  });

  await new Promise((resolve) => {
    console.log("setting up promise to wait for event");

    vault.on("StrategyUpdated", async () => {
      console.log("StrategyUpdated Event triggered");

      console.log("Strategy updated");

      await vault.connect(owner).setInvestPerc("8000");

      console.log("Calling updateInvested");

      await vault.connect(owner).updateInvested("0x");

      console.log("Vault investments updated");

      resolve(true);
    });

    console.log("setting USTAnchor strategy to UST vault");

    vault.setStrategy(ustAnchorStrategy.address);
  });
}

func.id = "devStrategy";
func.tags = ["devStrategies"];
func.dependencies = ["vaults", "strategies"];

export default func;
