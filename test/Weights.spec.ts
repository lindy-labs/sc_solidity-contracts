import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { time } from "@openzeppelin/test-helpers";

import type { Weights } from "../typechain";

import { ethers } from "hardhat";
import { expect } from "chai";

import { depositParams, claimParams } from "./shared/factories";
import {
  getLastBlockTimestamp,
  SHARES_MULTIPLIER,
  generateNewAddress,
} from "./shared";

const { utils, BigNumber } = ethers;
const { parseUnits } = ethers.utils;

describe("Weights", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let weights: Weights;
  const treasury = generateNewAddress();

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    let Weights = await ethers.getContractFactory("Weights");

    weights = (await Weights.deploy()) as Weights;
  });

  // describe("sponsor", () => {
  //   it("adds a sponsor to the weights", async () => {

  //     await weights.sponsor(parseUnits("500"), 0);
  //     await weights.sponsor(parseUnits("500"), 0);

  //     expect(await weights.totalSponsored()).to.eq(parseUnits("1000"));
  //   });

  //   it("fails if the sponsor amount is 0", async () => {
  //     const lockedUntil = (await getLastBlockTimestamp()).add(
  //       time.duration.days(15).toNumber()
  //     );

  //     await expect(
  //       weights.sponsor(parseUnits("0"), lockedUntil)
  //     ).to.be.revertedWith("Weights: cannot sponsor 0");
  //   });
  // });

  // describe("unsponsor", () => {
  //   it("removes a sponsor from the weights", async () => {
  //     await weights.sponsor(parseUnits("500"), 0);
  //     await weights.sponsor(parseUnits("500"), 0);

  //     await weights["unsponsor"](bob.address, [0]);

  //     expect(await weights.totalSponsored()).to.eq(parseUnits("500"));
  //     expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits("500"));
  //   });

  //   it("fails if token id belongs to a withdraw", async () => {

  //     await weights.deposit(
  //       depositParams.build({
  //         amount: parseUnits("500"),
  //         claims: [claimParams.percent(100).to(alice.address).build()],
  //       })
  //     );
  //     await weights.sponsor(parseUnits("500"), 0);

  //     await expect(
  //       weights["unsponsor"](alice.address, [0, 1])
  //     ).to.be.revertedWith("Weights: token id is not a sponsor");
  //   });

  //   it("fails if there are not enough funds", async () => {
  //     await weights.sponsor(parseUnits("1000"), 0);

  //     await weights.removeYield("500");

  //     await expect(
  //       weights.unsponsor(alice.address, [0])
  //     ).to.be.revertedWith("Weights: not enough funds");
  //   });
  // });

  describe("deposit", () => {});

  describe("withdraw", () => {
    const amount = 100;

    it("withdraws the principal of a deposit", async () => {
      await weights.deposit(amount, owner.address);

      const before = await weights.balance();
      await weights.withdraw(0);
      const after = await weights.balance();

      expect(after).to.equal(before.sub(amount));
    });

    it("removes the shares from the claimers", async () => {
      await weights.deposit(50, alice.address);
      await weights.deposit(50, bob.address);

      expect(await weights.claimShares(alice.address)).to.eq(parseUnits("50"));
      expect(await weights.claimShares(bob.address)).to.eq(parseUnits("50"));

      await weights.withdraw(0);

      expect(await weights.claimShares(alice.address)).to.eq(0);
      expect(await weights.claimShares(bob.address)).to.eq(parseUnits("50"));
    });

    it("fails if there's not enough funds", async () => {
      await weights.deposit(100, carol.address);

      await weights.removeYield(50);

      const action = weights.withdraw(0);

      await expect(action).to.be.revertedWith("Loss");
    });
  });

  describe("claimYield", () => {
    it("claims the yield of a user", async () => {
      await weights.deposit(100, bob.address);
      await weights.deposit(100, carol.address);
      await weights.addYield(100);

      const before = await weights.balance();
      await weights.claimYield(bob.address);
      const after = await weights.balance();

      expect(await weights.yieldFor(bob.address)).to.eq(0);
      expect(after).to.equal(before.sub(49));
      expect(await weights.yieldFor(carol.address)).to.eq(50);
    });
  });

  describe("yieldFor", () => {
    it("returns the amount of yield claimable by a user", async () => {
      const amount = 100;

      await weights.deposit(100, alice.address);
      await weights.deposit(100, bob.address);

      await weights.addYield(100);

      expect(await weights.yieldFor(alice.address)).to.eq(50);
      expect(await weights.yieldFor(bob.address)).to.eq(50);
    });
  });

  describe("deposit", () => {
    it("fails if the yield is negative", async () => {
      await weights.deposit(1000, alice.address);

      await weights.removeYield(21);

      const action = weights.deposit(1000, alice.address);
      await expect(action).to.be.revertedWith("Loss");
    });

    it("calculates correct number of shares for first deposit", async () => {
      await weights.deposit(100, owner.address);

      expect(await weights.totalShares()).to.equal(parseUnits("100"));
    });

    it("calculates correct number of shares for second deposit of equal size", async () => {
      // deposit 1 unit
      await weights.deposit(1000, alice.address);

      // deposit 1 unit
      await weights.deposit(1000, alice.address);

      // total shares must be 2 units
      expect(await weights.totalShares()).to.equal(parseUnits("1000").mul(2));
    });

    it("calculates correct number of shares for second deposit of different size", async () => {
      // deposit 1 unit
      await weights.deposit(1000, alice.address);

      // deposit 2 unit
      await weights.deposit(2000, bob.address);

      // total shares must be 3 units
      expect(await weights.totalShares()).to.equal(parseUnits("1000").mul(3));
    });
  });
});
