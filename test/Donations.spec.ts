import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { constants } from "ethers";

import type { Donations, TestERC20 } from "../typechain";
import { donationParams } from "./shared/factories";

const { parseUnits } = ethers.utils;

const DUMMY_TX =
  "0x5bdfd14fcc917abc2f02a30721d152a6f147f09e8cbaad4e0d5405d646c5c3e1";

const CHARITY_ID = 1;

describe("Donations", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let donations: Donations;
  let underlying: TestERC20;

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    const Donations = await ethers.getContractFactory("Donations");
    const TestERC20 = await ethers.getContractFactory("TestERC20");

    underlying = (await TestERC20.deploy(0)) as TestERC20;
    donations = (await Donations.deploy(owner.address)) as Donations;
  });

  describe("donate", () => {
    it("transfers the available amount in the given token to the charity", async () => {
      // set donated amount
      await underlying.mint(donations.address, parseUnits("200"));

      // create donations
      await donations.mint(DUMMY_TX, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      // burn donations
      await donations.connect(alice).burn("1");
      await donations.connect(alice).burn("2");

      // donate
      await donations.donate(CHARITY_ID, underlying.address, bob.address);

      expect(await underlying.balanceOf(bob.address)).to.equal(
        parseUnits("200")
      );
    });

    it("sets the available amount for that charity and token to 0", async () => {
      // set donated amount
      await underlying.mint(donations.address, parseUnits("200"));

      // create donations
      await donations.mint(DUMMY_TX, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      // burn donations
      await donations.connect(alice).burn("1");

      // donate
      await donations.donate(CHARITY_ID, underlying.address, bob.address);

      expect(
        await donations.transferableAmounts(underlying.address, CHARITY_ID)
      ).to.equal(0);
    });

    it("fails if there's nothing to donate", async () => {
      await expect(
        donations.donate(CHARITY_ID, underlying.address, bob.address)
      ).to.be.revertedWith("Donations: nothing to donate");
    });
  });

  describe("burn", () => {
    it("adds the donated amount to the charity", async () => {
      await donations.mint(DUMMY_TX, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      expect(
        await donations.transferableAmounts(underlying.address, CHARITY_ID)
      ).to.equal(0);

      await donations.connect(alice).burn("1");

      expect(
        await donations.transferableAmounts(underlying.address, CHARITY_ID)
      ).to.equal(parseUnits("100"));
    });

    it("works if the caller is the owner of the NFT", async () => {
      await donations.mint(DUMMY_TX, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      await donations.connect(alice).burn("1");

      expect(
        await donations.transferableAmounts(underlying.address, CHARITY_ID)
      ).to.equal(parseUnits("100"));
    });

    it("works if the caller is the admin", async () => {
      await donations.mint(DUMMY_TX, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      await donations.connect(owner).burn("1");

      expect(
        await donations.transferableAmounts(underlying.address, CHARITY_ID)
      ).to.equal(parseUnits("100"));
    });

    it("fails if the caller is not the owner nor the admin", async () => {
      await donations.mint(DUMMY_TX, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      await expect(donations.connect(bob).burn("1")).to.be.revertedWith(
        "Donations: not allowed"
      );
    });
  });

  describe("mint", () => {
    it("mints an NFT for every donation", async () => {
      await donations.mint(DUMMY_TX, [
        donationParams.build(),
        donationParams.build(),
        donationParams.build(),
        donationParams.build(),
      ]);

      expect(await donations.metadataId()).to.equal("4");
    });

    it("mints the correct NFT", async () => {
      await donations.mint(DUMMY_TX, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("1"),
          token: underlying.address,
          owner: owner.address,
        }),
      ]);

      expect(await donations.ownerOf("1")).to.equal(owner.address);

      const donation = await donations.metadata("1");

      expect(donation.amount).to.equal(parseUnits("1"));
      expect(donation.destinationId).to.equal(CHARITY_ID);
      expect(donation.token).to.equal(underlying.address);
    });

    it("marks the transaction as processed", async () => {
      await donations.mint(DUMMY_TX, [donationParams.build()]);

      expect(await donations.processedTx(DUMMY_TX)).to.equal(true);
    });

    it("fails if the transaction was already processed", async () => {
      await donations.mint(DUMMY_TX, [donationParams.build()]);

      await expect(
        donations.mint(DUMMY_TX, [donationParams.build()])
      ).to.be.revertedWith("Donations: already processed");
    });
  });
});
