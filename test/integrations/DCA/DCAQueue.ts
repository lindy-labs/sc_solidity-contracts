import { ethers } from "hardhat";
import { expect } from "chai";

import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TestDCAQueue, MockERC20, MockVault } from "@root/typechain";
import { BigNumber } from "ethers";

import { ForkHelpers, moveForwardTwoWeeks } from "../../shared";
import { depositParams, claimParams } from "../../shared/factories";

const { parseUnits } = ethers.utils;

describe.skip("DCA", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let vault: MockVault;

  let token: MockERC20;
  let dca: TestDCAQueue;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    let MockERC20 = await ethers.getContractFactory("MockERC20");
    let TestDCAQueue = await ethers.getContractFactory("TestDCAQueue");
    let MockVault = await ethers.getContractFactory("MockVault");

    token = (await MockERC20.deploy(0)) as MockERC20;
    const investedToken = (await MockERC20.deploy(0)) as MockERC20;
    vault = (await MockVault.deploy(token.address, 0, 0)) as MockVault;

    dca = (await TestDCAQueue.deploy(vault.address)) as TestDCAQueue;

    await token
      .connect(alice)
      .approve(vault.address, parseUnits("1000000000", 6));

    await ForkHelpers.setTokenBalance(token, alice, parseUnits("200", 6));
  });

  describe("constructor", () => {
    it("fails if a non-vault is given", async () => {
      let TestDCAQueue = await ethers.getContractFactory("TestDCAQueue");

      const action = TestDCAQueue.deploy(alice.address);

      await expect(action).to.be.revertedWith(
        "DCAQueue: vault does not implement IVault"
      );
    });
  });

  describe("onDepositMinted", () => {
    it("creates a deposit record", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));

      const deposit = await dca.deposits(0);

      expect(deposit.beneficiary).to.equal(alice.address);

      expect(deposit.shares).to.equal(parseUnits("10"));
    });

    it("creates a new account with one position", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));

      const account = await dca.getAccount(alice.address);
      expect(account.positionsFirst).to.equal(0);
      expect(account.positionsLength).to.equal(1);

      const position = await dca.getLastPosition(alice.address);

      expect(position.start).to.equal(0);
      expect(position.end).to.equal(await dca.MAX_INT());
      expect(position.shares).to.equal(parseUnits("10"));
    });

    it("sets totalShares", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));

      expect(await dca.totalShares()).to.equal(parseUnits("10"));
    });

    it("emits an event", async () => {
      const action = vault
        .connect(alice)
        .deposit(dcaDepositParams(10, alice.address));

      await expect(action)
        .to.emit(dca, "SharesMinted")
        .withArgs(alice.address, parseUnits("10"));
    });

    it("replaces prior position if no purchases have been made for it", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));
      await vault.connect(alice).deposit(dcaDepositParams(5, alice.address));

      const account = await dca.getAccount(alice.address);
      expect(account.positionsFirst).to.equal(0);
      expect(account.positionsLength).to.equal(1);

      const position = await dca.getPositionAt(alice.address, 0);

      expect(position.start).to.equal(0);
      expect(position.end).to.equal(await dca.MAX_INT());
      expect(position.shares).to.equal(parseUnits("15"));
    });

    it("adds a new positon if prior one has purchases", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));

      await dca.test_addPurchase(1);

      await vault.connect(alice).deposit(dcaDepositParams(5, alice.address));

      const account = await dca.getAccount(alice.address);
      expect(account.positionsFirst).to.equal(0);
      expect(account.positionsLength).to.equal(2);

      const p0 = await dca.getPositionAt(alice.address, 0);
      const p1 = await dca.getPositionAt(alice.address, 1);

      expect(p0.start).to.equal(0);
      expect(p0.end).to.equal(0);
      expect(p0.shares).to.equal(parseUnits("10"));

      expect(p1.start).to.equal(1);
      expect(p1.end).to.equal(await dca.MAX_INT());
      expect(p1.shares).to.equal(parseUnits("15"));
    });

    it("keeps separate beneficiaries with separate positions", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(1, alice.address));
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));
      await vault.connect(alice).deposit(dcaDepositParams(100, bob.address));

      const alicePosition = await dca.getPositionAt(alice.address, 0);
      const bobPosition = await dca.getPositionAt(bob.address, 0);

      expect(alicePosition.shares).to.equal(parseUnits("11"));
      expect(bobPosition.shares).to.equal(parseUnits("100"));
    });

    it("is not callable by a non-vault", async () => {
      const action = dca.connect(alice).onDepositMinted(1, 1, alice.address);

      await expect(action).to.be.revertedWith(
        "DCAQueue: sender is not the vault"
      );
    });
  });

  describe("onDepositBurned", () => {
    it("deletes an existing deposit record", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));

      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [0]);

      const deposit = await dca.deposits(0);

      expect(deposit.beneficiary).to.equal(ethers.constants.AddressZero);
      expect(deposit.shares).to.equal(parseUnits("0"));
    });

    it("emits an event", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));

      await moveForwardTwoWeeks();
      const action = vault.connect(alice).withdraw(alice.address, [0]);

      await expect(action)
        .to.emit(dca, "SharesBurned")
        .withArgs(alice.address, parseUnits("10"));
    });

    it("is not callable by the non-vault", async () => {
      const action = dca.connect(alice).onDepositBurned(1);

      await expect(action).to.be.revertedWith(
        "DCAQueue: sender is not the vault"
      );
    });

    it("subtracts from the current position if still unused", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));
      await vault.connect(alice).deposit(dcaDepositParams(5, alice.address));

      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [1]);

      const account = await dca.getAccount(alice.address);
      expect(account.positionsFirst).to.equal(0);
      expect(account.positionsLength).to.equal(1);

      const position = await dca.getPositionAt(alice.address, 0);

      expect(position.start).to.equal(0);
      expect(position.end).to.equal(await dca.MAX_INT());
      expect(position.shares).to.equal(parseUnits("10"));
    });

    it("adds a new position if prior one has purchases", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));
      await vault.connect(alice).deposit(dcaDepositParams(5, alice.address));

      await dca.test_addPurchase(1);

      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [1]);

      const account = await dca.getAccount(alice.address);
      expect(account.positionsFirst).to.equal(0);
      expect(account.positionsLength).to.equal(2);

      const p0 = await dca.getPositionAt(alice.address, 0);
      const p1 = await dca.getPositionAt(alice.address, 1);

      expect(p0.start).to.equal(0);
      expect(p0.end).to.equal(0);
      expect(p0.shares).to.equal(parseUnits("15"));

      expect(p1.start).to.equal(1);
      expect(p1.end).to.equal(await dca.MAX_INT());
      expect(p1.shares).to.equal(parseUnits("10"));
    });
  });

  describe("collapse", () => {
    it("collapses when there's only one finished position", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(10, alice.address));
      await dca.test_addPurchase(62);
      await vault.connect(alice).deposit(dcaDepositParams(5, alice.address));

      await dca.collapse(alice.address, 10);

      const account = await dca.getAccount(alice.address);
      expect(account.positionsFirst).to.equal(1);
      expect(account.positionsLength).to.equal(1);

      expect(account.reserved).to.equal(62);
    });

    it("does nothing if no positions exist yet", async () => {
      dca.collapse(alice.address, 2);

      const account = await dca.getAccount(alice.address);
      expect(account.positionsFirst).to.equal(0);
      expect(account.positionsLength).to.equal(0);
      expect(account.reserved).to.equal(0);
    });
  });

  describe("_claimFromVault", () => {
    it("claims yield from the vaults", async () => {
      await vault.connect(alice).deposit(dcaDepositParams(100, bob.address));

      await ForkHelpers.mintToken(token, vault, 300);

      const action = () => dca.test_claimFromVault();

      await expect(action).to.changeTokenBalances(
        token,
        [dca, vault],
        [300, -300]
      );
    });
  });

  function dcaDepositParams(
    usdcAmount: BigNumber | number,
    beneficiary: string
  ): any {
    return depositParams.build({
      amount: usdcAmount,
      claims: [
        claimParams.percent(100).to(dca.address).build({ data: beneficiary }),
      ],
    });
  }
});
