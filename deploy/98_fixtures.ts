import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { parseUnits } from "@ethersproject/units";
import { BigNumber } from "ethers";
import { run, ethers } from "hardhat";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { get } = env.deployments;

  const [owner, alice, bob, treasury] = await ethers.getSigners();

  console.table([alice, bob, treasury]);

  const usdc = await get("USDC");
  const underlying = await ethers.getContractAt("MockERC20", usdc.address);

  const vaultAddress = (await get("Vault_USDC")).address;
  const vault = await ethers.getContractAt("Vault", vaultAddress);

  await underlying.mint(alice.address, parseUnits("5000", 6));
  await underlying.mint(bob.address, parseUnits("5000", 6));

  await Promise.all(
    [alice, bob, treasury].map((account) =>
      underlying.connect(account).approve(vault.address, parseUnits("5000", 6))
    )
  );

  console.log("Set treasury");
  await vault.connect(owner).setTreasury(treasury.address);

  console.log("The treasury sponsors 1000");
  const lockDuration = await vault.MIN_SPONSOR_LOCK_DURATION();
  await vault
    .connect(treasury)
    .sponsor(ust.address, parseUnits("1000", 6), lockDuration);

  console.log(
    "Alice deposits 1000 with 90% yield to Alice and 10% yield for donations"
  );
  await vault.connect(alice).deposit({
    amount: parseUnits("1000", 6),
    inputToken: ust.address,
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

  console.log(
    "Bob deposits 1000 with 50% yield to Alice and 50% yield for donations"
  );
  await vault.connect(bob).deposit({
    amount: parseUnits("1000", 6),
    inputToken: ust.address,
    lockDuration: 1,
    claims: [
      {
        beneficiary: bob.address,
        pct: 5000,
        data: "0x",
      },
      {
        beneficiary: treasury.address,
        pct: 5000,
        data: ethers.utils.hexlify(123123),
      },
    ],
  });

  console.log("2000 yield is generated");
  await underlying.mint(vault.address, parseUnits("2000", 6));

  console.log("Alice claims");
  await vault.connect(alice).claimYield(alice.address);

  console.log("The treasury claims");
  await vault.connect(treasury).claimYield(treasury.address);
};

func.id = "fixtures";
func.tags = ["fixtures"];
func.dependencies = ["vaults", "devStrategies"];

export default func;
