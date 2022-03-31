import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";
import { utils } from "ethers";

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  if (env.network.config.chainId !== 31337) {
    return;
  }

  await deployUSTStrategyDependencies(env);
};

async function deployUSTStrategyDependencies(env: HardhatRuntimeEnvironment) {
  const { deployer, ethAnchorOperator, ethAnchorOperator1 } =
    await env.getNamedAccounts();
  const { deploy, get } = env.deployments;
  const [owner, alice, bob, treasury] = await ethers.getSigners();

  console.table([alice, bob, treasury]);

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
      mockaUSTDeployment.address,
      owner.address,
    ],
    log: true,
  });

  const ustAnchorStrategyAddress = (await get("AnchorUSTStrategy")).address;
  const ustAnchorStrategy = await ethers.getContractAt(
    "AnchorUSTStrategy",
    ustAnchorStrategyAddress
  );

  await underlying.mint(alice.address, parseUnits("5000", 18));
  await underlying.mint(bob.address, parseUnits("5000", 18));
  await mockaUST.mint(owner.address, parseUnits("5000", 18));

  await Promise.all(
    [alice, bob, treasury, owner].map((account) =>
      underlying.connect(account).approve(vault.address, parseUnits("5000", 18))
    )
  );

  await mockaUST.connect(owner).approve(vault.address, parseUnits("5000", 18));
  await mockaUST
    .connect(owner)
    .approve(mockEthAnchorRouter.address, parseUnits("5000", 18));
  await mockaUST
    .connect(owner)
    .approve(ustAnchorStrategy.address, parseUnits("5000", 18));

  console.log("Grant MANAGER_ROLE to owner");
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes("MANAGER_ROLE"));
  await ustAnchorStrategy.connect(owner).grantRole(MANAGER_ROLE, owner.address);

  console.log("Set treasury for UST vault");
  await vault.connect(owner).setTreasury(treasury.address);

  console.log("Set investment percentage for UST vault");
  await vault.connect(owner).setInvestPerc("8000");

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
  });

  await new Promise((resolve) => {
    console.log(
      "Setting up promise to wait for StrategyUpdated & InitDepositStable event"
    );

    let firstDeposit = true;

    vault.on("StrategyUpdated", async () => {
      ustAnchorStrategy.on(
        "InitDepositStable",
        async (operator, idx, underlyingAmount, ustAmount) => {
          if (!firstDeposit) {
            console.log("After second updateInvested");

            resolve(true);

            return;
          }

          console.log("InitDepositStable event triggered, finishing deposit");

          console.log("MockEthAnchorRouter notifyDepositResult");
          await mockEthAnchorRouter.notifyDepositResult(operator, ustAmount);

          console.log("Stable Deposit finished");
          await ustAnchorStrategy.finishDepositStable(idx);

          firstDeposit = false;

          await mockChainlinkPriceFeed.setLatestRoundData(
            2,
            utils.parseEther("1"),
            0,
            2,
            2
          );

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
          });

          await mockEthAnchorRouter.addPendingOperator(ethAnchorOperator1);

          await vault.connect(owner).updateInvested("0x");
        }
      );

      await mockChainlinkPriceFeed.setLatestRoundData(
        1,
        ethers.utils.parseEther("1"),
        0,
        1,
        1
      );

      console.log("StrategyUpdated Event triggered, calling updateInvested");
      await vault.connect(owner).updateInvested("0x");
    });

    console.log("Setting USTAnchor strategy to UST vault");
    vault.setStrategy(ustAnchorStrategy.address);
  });
}

func.id = "devStrategy";
func.tags = ["devStrategies"];
func.dependencies = ["vaults", "strategies"];

export default func;
