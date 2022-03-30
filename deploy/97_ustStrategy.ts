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
  const { deployer, ethAnchorOperator } = await env.getNamedAccounts();
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
      mockaUSTDeployment.address,
      owner.address,
    ],
    log: true,
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
    console.log("Setting up promise to wait for StrategyUpdated event");

    vault.on("StrategyUpdated", async () => {
      ustAnchorStrategy.on(
        "InitDepositStable",
        async (operator, idx, underlyingAmount, ustAmount) => {
          console.log(
            "InitDepositStable event triggered",
            operator,
            idx,
            underlyingAmount,
            ustAmount
          );

          console.log(
            "DEBUG mockaUST owner balanceOf",
            await mockaUST.balanceOf(owner.address)
          );

          console.log(
            "DEBUG mockaUST owner allowance",
            await mockaUST.allowance(
              owner.address,
              mockEthAnchorRouter.address
            ),
            mockaUST.address
          );

          console.log("MockEthAnchorRouter notifyDepositResult");
          await mockEthAnchorRouter.notifyDepositResult(operator, ustAmount);

          console.log("Stable Deposit finished");
          await ustAnchorStrategy.connect(owner).finishDepositStable(idx);

          resolve(true);
        }
      );

      console.log("StrategyUpdated Event triggered");

      await vault.connect(owner).setInvestPerc("8000");

      console.log("Calling updateInvested");
      await vault.connect(owner).updateInvested("0x");

      console.log("Vault investments updated");
    });

    console.log("Setting USTAnchor strategy to UST vault");
    vault.setStrategy(ustAnchorStrategy.address);
  });
}

func.id = "devStrategy";
func.tags = ["devStrategies"];
func.dependencies = ["vaults", "strategies"];

export default func;
