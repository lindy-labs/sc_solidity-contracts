import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";
import { utils } from "ethers";

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  const { deployer, ethAnchorOperator, ethAnchorOperator1 } =
    await env.getNamedAccounts();
  const { deploy, get } = env.deployments;
  const [owner, alice, bob, treasury] = await ethers.getSigners();

  const mockUST = await get("UST");
  const underlying = await ethers.getContractAt("MockERC20", mockUST.address);

  const mockaUSTDeployment = await get("aUST");
  const mockaUST = await ethers.getContractAt(
    "MockERC20",
    mockaUSTDeployment.address
  );

  await deploy("MockEthAnchorRouter", {
    contract: "MockEthAnchorRouter",
    from: deployer,
    args: [mockUST.address, mockaUST.address],
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

  await deploy("AnchorUSTStrategy", {
    contract: "AnchorUSTStrategy",
    from: deployer,
    args: [
      vault.address,
      mockEthAnchorRouterDeployment.address,
      mockChainlinkPriceFeed.address,
      mockUST.address,
      mockaUSTDeployment.address,
      owner.address,
    ],
    log: true,
  });

  const ustAnchorStrategyDeployment = await get("AnchorUSTStrategy");
  const ustAnchorStrategy = await ethers.getContractAt(
    "AnchorUSTStrategy",
    ustAnchorStrategyDeployment.address
  );

  await mintAndAllowTokens();
  await configureContracts();

  console.log("Alice deposits into UST vault");
  await vault.connect(alice).deposit({
    amount: parseUnits("2000", 18),
    lockDuration: 1,
    claims: [
      {
        beneficiary: alice.address,
        pct: 10000,
        data: "0x",
      },
    ],
    inputToken: mockUST.address,
  });

  await new Promise((resolve) => {
    console.log(
      "Setting up promise to wait for StrategyUpdated & InitDepositStable event"
    );

    let firstDeposit = true;

    vault.on("StrategyUpdated", async () => {
      ustAnchorStrategy.on(
        "InitDepositStable",
        async (operator, idx, _underlyingAmount, ustAmount) => {
          if (!firstDeposit) {
            console.log(
              "Second updateInvested triggered, finish fixture execution"
            );

            resolve(true);
            return;
          }

          console.log("InitDepositStable event triggered, finishing deposit");
          await mockEthAnchorRouter.notifyDepositResult(operator, ustAmount);

          console.log("Stable Deposit finished");
          await ustAnchorStrategy.finishDepositStable(idx);
          firstDeposit = false;

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
        }
      );

      await setChainlinkData(1);

      console.log("StrategyUpdated Event triggered, calling updateInvested");
      await mockEthAnchorRouter.addPendingOperator(ethAnchorOperator);
      await vault.connect(owner).updateInvested("0x");
    });

    console.log("Setting USTAnchor strategy to UST vault");
    vault.setStrategy(ustAnchorStrategy.address);
  });

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

  async function configureContracts() {
    const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes("MANAGER_ROLE"));
    await ustAnchorStrategy
      .connect(owner)
      .grantRole(MANAGER_ROLE, owner.address);

    await vault.connect(owner).setTreasury(treasury.address);

    await vault.connect(owner).setInvestPerc("8000");
  }
};

func.id = "devStrategy";
func.tags = ["devStrategies"];
func.dependencies = ["vaults", "strategies"];

// Deploy only to hardhat
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337;

export default func;
