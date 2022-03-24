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
  const underlying = await ethers.getContractAt("MockERC20", mockUST.address);

  const mockaUST = await get("aUST");
  const aUST = await ethers.getContractAt("MockERC20", mockaUST.address);

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

  const vaultDeployment = await get("Vault_UST");
  const vault = await ethers.getContractAt("Vault", vaultDeployment.address);
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

  await deploy("AnchorUSTStrategy", {
    contract: "AnchorUSTStrategy",
    from: deployer,
    log: true,
    args,
  });

  console.log("minting underlying UST tokens");

  await underlying.mint(alice.address, parseUnits("5000", 18));
  await underlying.mint(bob.address, parseUnits("5000", 18));

  await Promise.all(
    [alice, bob, treasury, owner].map((account) =>
      underlying.connect(account).approve(vault.address, parseUnits("5000", 18))
    )
  );

  await Promise.all(
    [alice, bob, treasury, owner].map((account) =>
      aUST.connect(account).approve(vault.address, parseUnits("5000", 18))
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

  console.log(
    "Alice deposits 1000 with 90% yield to Alice and 10% yield for donations to UST vault"
  );
  await vault.connect(alice).deposit({
    amount: parseUnits("1000", 18),
    lockDuration: 1,
    claims: [
      {
        beneficiary: alice.address,
        pct: 9000,
        data: "0x",
      },
      {
        beneficiary: treasury.address,
        pct: 1000,
        data: ethers.utils.hexlify(123124),
      },
    ],
  });

  console.log("setting USTAnchor strategy to UST vault");

  console.log("ustAnchorStrategy address", ustAnchorStrategy.address);

  // vault.on("StrategyUpdated", async () => {
  // });

  await vault.setStrategy(ustAnchorStrategy.address);

  await new Promise((resolve) => setTimeout(resolve, 1000)); // TODO: replace with listener

  console.log("strategy updated");

  console.log("Execute UpdateInvested");

  console.log(
    "investableAmount",
    BigNumber.from((await vault.investableAmount()).toString())
  );

  // await Promise.all(
  //   [alice, bob, treasury, owner].map((account) =>
  //     underlying.connect(account).approve(vault.address, parseUnits("5000", 6))
  //   )
  // );

  console.log("setting investment percentage");

  await vault.connect(owner).setInvestPerc("8000");

  console.log("calling updateInvested");

  await vault.connect(owner).updateInvested("0x");
}

func.id = "devStrategy";
func.tags = ["devStrategies"];
func.dependencies = ["vaults", "strategies"];

export default func;
