import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { time } from "@openzeppelin/test-helpers";
import { Contract } from "ethers";

import type {
  Vault,
  TestERC20,
  Depositors,
  Claimers,
  USTStrategy,
} from "../typechain";
import { Claimers__factory, Depositors__factory } from "../typechain";

import { ethers } from "hardhat";
import { expect } from "chai";

import { depositParams, claimParams } from "./shared/factories";
import {
  getLastBlockTimestamp,
  moveForwardTwoWeeks,
  SHARES_MULTIPLIER,
  generateNewAddress,
  arrayFromTo,
} from "./shared";

const { utils, BigNumber } = ethers;
const { parseUnits } = ethers.utils;

describe("Vault", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let mockEthAnchorRouter: Contract;
  let mockExchangeRateFeeder: Contract;

  let underlying: TestERC20;
  let aUstToken: Contract;
  let vault: Vault;
  let depositors: Depositors;
  let claimers: Claimers;
  let strategy: USTStrategy;
  const treasury = generateNewAddress();

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    let TestERC20 = await ethers.getContractFactory("TestERC20");
    let Vault = await ethers.getContractFactory("Vault");
    let MockStrategy = await ethers.getContractFactory("MockStrategy");

    underlying = (await TestERC20.deploy(0)) as TestERC20;
    aUstToken = await TestERC20.deploy(utils.parseEther("1000000000"));

    const MockEthAnchorRouterFactory = await ethers.getContractFactory(
      "MockEthAnchorRouter"
    );
    mockEthAnchorRouter = await MockEthAnchorRouterFactory.deploy(
      underlying.address,
      aUstToken.address
    );

    const MockExchangeRateFeederFactory = await ethers.getContractFactory(
      "MockExchangeRateFeeder"
    );
    mockExchangeRateFeeder = await MockExchangeRateFeederFactory.deploy();

    vault = (await Vault.deploy(
      underlying.address,
      1209600,
      0,
      owner.address
    )) as Vault;

    strategy = (await MockStrategy.deploy(
      vault.address,
      treasury,
      mockEthAnchorRouter.address,
      mockExchangeRateFeeder.address,
      underlying.address,
      aUstToken.address,
      BigNumber.from("200")
    )) as USTStrategy;

    depositors = Depositors__factory.connect(await vault.depositors(), owner);
    claimers = Claimers__factory.connect(await vault.claimers(), owner);
  });

  describe("deposit", () => {
    it.skip("fails if the yield is negative", async () => {
      await addUnderlyingBalance(alice, "2000");

      const params = depositParams.build({
        amount: parseUnits("1000"),
      });

      await vault.connect(alice).deposit(params);

      await removeUnderlyingFromVault("21");

      await expect(vault.connect(alice).deposit(params)).to.be.revertedWith(
        "Vault: cannot deposit when yield is negative"
      );
    });

    it.skip("works if the negative yield is less than the strategy's estimated fees", async () => {
      await vault.setStrategy(strategy.address);

      await addUnderlyingBalance(alice, "2000");

      const params = depositParams.build({
        amount: parseUnits("1000"),
      });

      await vault.connect(alice).deposit(params);

      await removeUnderlyingFromVault("19");

      await vault.connect(alice).deposit(params);
    });

    it("works with valid parameters", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build();

      await vault.connect(alice).deposit(params);
    });

    it.skip("works with multiple claims", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        claims: [
          claimParams.percent(50).build(),
          claimParams.percent(50).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
    });

    it.skip("calculates correct number of shares for first deposit", async () => {
      await addUnderlyingBalance(alice, "1000");

      const amount = parseUnits("1");
      const params = depositParams.build({ amount });

      await vault.connect(alice).deposit(params);

      expect(await vault.totalShares()).to.equal(amount.mul(SHARES_MULTIPLIER));
    });

    it("calculates correct number of shares for second deposit of equal size", async () => {
      await addUnderlyingBalance(alice, "1000");
      await addUnderlyingBalance(bob, "1000");

      const amount = parseUnits("1");
      const params = depositParams.build({ amount });

      // deposit 1 unit
      await vault.connect(alice).deposit(params);

      // deposit 1 unit
      await vault.connect(bob).deposit(params);

      // total shares must be 2 units
      expect(await vault.totalShares()).to.equal(
        amount.mul(2).mul(SHARES_MULTIPLIER)
      );
    });

    it.skip("calculates correct number of shares for second deposit of different size", async () => {
      await addUnderlyingBalance(alice, "1000");
      await addUnderlyingBalance(bob, "1000");
      const amount = parseUnits("1");

      // deposit 1 unit
      const params1 = depositParams.build({ amount });
      await vault.connect(alice).deposit(params1);

      // deposit 2 unit
      const params2 = depositParams.build({ amount: amount.mul(2) });
      await vault.connect(bob).deposit(params2);

      // total shares must be 3 units
      expect(await vault.totalShares()).to.equal(
        amount.mul(3).mul(SHARES_MULTIPLIER)
      );
    });

    it.skip("fails if pct does not add up to 100%", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        claims: [
          claimParams.percent(49).build(),
          claimParams.percent(50).build(),
        ],
      });

      const action = vault.connect(alice).deposit(params);

      await expect(action).to.be.revertedWith(
        "Vault: claims don't add up to 100%"
      );
    });
  });

  function addYieldToVault(amount: string) {
    return underlying.mint(vault.address, parseUnits(amount));
  }

  async function addUnderlyingBalance(
    account: SignerWithAddress,
    amount: string
  ) {
    await underlying.mint(account.address, parseUnits(amount));
    return underlying
      .connect(account)
      .approve(vault.address, parseUnits(amount));
  }

  function removeUnderlyingFromVault(amount: string) {
    return underlying.burn(vault.address, parseUnits(amount));
  }
});
