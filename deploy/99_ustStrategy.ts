import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";
import { utils } from "ethers";

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  const { ethAnchorOperator, ethAnchorOperator1 } =
    await env.getNamedAccounts();
  const { get } = env.deployments;
  const [owner, alice, bob, treasury] = await ethers.getSigners();

  const mockUST = await get("UST");
  const underlying = await ethers.getContractAt("MockERC20", mockUST.address);

  const mockaUSTDeployment = await get("aUST");
  const mockaUST = await ethers.getContractAt(
    "MockERC20",
    mockaUSTDeployment.address
  );

  console.log("Deployed UST strategy dependencies");

  const vaultDeployment = await get("Vault_UST");
  const vault = await ethers.getContractAt("Vault", vaultDeployment.address);
  const mockEthAnchorRouterDeployment = await get("MockEthAnchorRouter");
  const mockChainlinkPriceFeedDeployment = await get("MockChainlinkPriceFeed");
  const mockChainlinkPriceFeed = await ethers.getContractAt(
    "MockChainlinkPriceFeed",
    mockChainlinkPriceFeedDeployment.address
  );

  const mockEthAnchorRouter = await ethers.getContractAt(
    "MockEthAnchorRouter",
    mockEthAnchorRouterDeployment.address
  );

  console.log("Deploy AnchorUSTStrategy for development");

  const ustAnchorStrategyDeployment = await get("AnchorUSTStrategy");
  const ustAnchorStrategy = await ethers.getContractAt(
    "AnchorUSTStrategy",
    ustAnchorStrategyDeployment.address
  );

  await mintAndAllowTokens();

  console.log("Setting USTAnchor strategy to UST vault");
  const setStrategyTx = await vault.setStrategy(ustAnchorStrategy.address);
  await setStrategyTx.wait();

  await setChainlinkData(1);

  console.log("StrategyUpdated Event triggered, calling updateInvested");
  await mockEthAnchorRouter.addPendingOperator(ethAnchorOperator);
  const updateInvestedTx = await vault.connect(owner).updateInvested("0x");
  await updateInvestedTx.wait();

  await mockEthAnchorRouter.notifyDepositResult(
    ethAnchorOperator,
    parseUnits("2000", 18)
  );

  console.log("Stable Deposit finished");
  await ustAnchorStrategy.finishDepositStable("0");

  await setChainlinkData(2);

  await vault.connect(bob).deposit({
    amount: parseUnits("1500", 18),
    lockDuration: 1,
    claims: [
      {
        beneficiary: bob.address,
        pct: 10000,
        data: "0x",
      },
    ],
    inputToken: mockUST.address,
  });

  await mockEthAnchorRouter.addPendingOperator(ethAnchorOperator1);
  await vault.connect(owner).updateInvested("0x");

  // End of fixture logic

  async function setChainlinkData(round: number) {
    await mockChainlinkPriceFeed.setLatestRoundData(
      round,
      ethers.utils.parseEther("1"),
      0,
      round,
      round
    );
  }

  async function mintAndAllowTokens() {
    await underlying.mint(alice.address, parseUnits("5000", 18));
    await underlying.mint(bob.address, parseUnits("5000", 18));
    await mockaUST.mint(owner.address, parseUnits("5000", 18));

    await Promise.all(
      [alice, bob, treasury, owner].map((account) =>
        underlying
          .connect(account)
          .approve(vault.address, parseUnits("5000", 18))
      )
    );

    await mockaUST
      .connect(owner)
      .approve(vault.address, parseUnits("5000", 18));
    await mockaUST
      .connect(owner)
      .approve(mockEthAnchorRouter.address, parseUnits("5000", 18));
    await mockaUST
      .connect(owner)
      .approve(ustAnchorStrategy.address, parseUnits("5000", 18));
  }
};

func.id = "dev_strategies";
func.tags = ["dev_strategies"];
func.dependencies = ["vaults", "fixtures", "fixture_deployments"];

// Deploy only to hardhat
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337;

export default func;
