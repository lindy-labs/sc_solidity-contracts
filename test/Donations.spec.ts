import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@openzeppelin/test-helpers";
import { BigNumber, constants, utils } from "ethers";

import type { Donations } from "../typechain";
import { MockDAI, MockDAI__factory } from "../typechain";
import { donationParams } from "./shared/factories";
import {
  getLastBlockTimestamp,
  getRoleErrorMsg,
  moveForwardTwoWeeks,
} from "./shared";

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
  let underlying: MockDAI;
  let WORKER_ROLE: string;
  let DEFAULT_ADMIN_ROLE: string;

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    const Donations = await ethers.getContractFactory("Donations");
    const MockDAI = await ethers.getContractFactory("MockDAI");

    underlying = (await MockDAI.deploy(0)) as MockDAI;
    donations = (await Donations.deploy(owner.address)) as Donations;
    WORKER_ROLE = await donations.WORKER_ROLE();
    DEFAULT_ADMIN_ROLE = await donations.DEFAULT_ADMIN_ROLE();
  });

  describe("constructor", () => {
    it("it reverts if owner is address(0)", async () => {
      const Donations = await ethers.getContractFactory("Donations");

      await expect(Donations.deploy(constants.AddressZero)).to.be.revertedWith(
        "Vault: owner cannot be 0x0"
      );
    });

    it("sets the initial state", async () => {
      expect(
        await donations.hasRole(DEFAULT_ADMIN_ROLE, owner.address)
      ).to.be.equal(true);
      expect(await donations.hasRole(WORKER_ROLE, owner.address)).to.be.equal(
        true
      );
    });
  });

  describe("setTTL", () => {
    it("changes the TTL", async () => {
      const newTTL = BigNumber.from(time.duration.days(100).toNumber());

      expect(await donations.ttl()).not.to.equal(newTTL);

      await donations.setTTL(newTTL);

      expect(await donations.ttl()).to.equal(newTTL);
    });

    it("emits an event", async () => {
      const newTTL = BigNumber.from(time.duration.days(100).toNumber());

      const tx = donations.setTTL(newTTL);

      await expect(tx).to.emit(donations, "TTLUpdated").withArgs(newTTL);
    });

    it("fails if the caller is not authorized", async () => {
      const newTTL = BigNumber.from(time.duration.days(100).toNumber());

      await expect(donations.connect(alice).setTTL(newTTL)).to.be.revertedWith(
        getRoleErrorMsg(alice, DEFAULT_ADMIN_ROLE)
      );
    });
  });

  describe("donate", () => {
    it("transfers the available amount in the given token to the charity", async () => {
      // set donated amount
      await underlying.mint(donations.address, parseUnits("200"));

      // create donations
      await donations.mint(DUMMY_TX, 0, [
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
      await donations.connect(alice).burn(0);
      await donations.connect(alice).burn(1);

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
      await donations.mint(DUMMY_TX, 0, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      // burn donations
      await donations.connect(alice).burn(0);

      // donate
      await donations.donate(CHARITY_ID, underlying.address, bob.address);

      expect(
        await donations.transferableAmounts(underlying.address, CHARITY_ID)
      ).to.equal(0);
    });

    it("emits an event", async () => {
      // set donated amount
      await underlying.mint(donations.address, parseUnits("200"));

      // create donations
      const amount = parseUnits("100");

      await donations.mint(DUMMY_TX, 0, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount,
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      // burn donations
      await donations.connect(alice).burn(0);

      const tx = donations.donate(CHARITY_ID, underlying.address, bob.address);

      await expect(tx)
        .to.emit(donations, "DonationsSent")
        .withArgs(CHARITY_ID, underlying.address, bob.address, amount);
    });

    it("fails if there's nothing to donate", async () => {
      await expect(
        donations.donate(CHARITY_ID, underlying.address, bob.address)
      ).to.be.revertedWith("Donations: nothing to donate");
    });

    it("fails if the caller is not authorized", async () => {
      await expect(
        donations
          .connect(alice)
          .donate(CHARITY_ID, underlying.address, bob.address)
      ).to.be.revertedWith(getRoleErrorMsg(alice, WORKER_ROLE));
    });
  });

  describe("burn", () => {
    it("adds the donated amount to the charity", async () => {
      await donations.mint(DUMMY_TX, 0, [
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

      await donations.connect(alice).burn(0);

      expect(
        await donations.transferableAmounts(underlying.address, CHARITY_ID)
      ).to.equal(parseUnits("100"));
    });

    it("works if the caller is the owner of the NFT", async () => {
      await donations.mint(DUMMY_TX, 0, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      await donations.connect(alice).burn(0);

      expect(
        await donations.transferableAmounts(underlying.address, CHARITY_ID)
      ).to.equal(parseUnits("100"));
    });

    it("works if the caller is the admin and the NFT already expired", async () => {
      const ttl = BigNumber.from(time.duration.days(14).toNumber());
      await donations.setTTL(ttl);

      await donations.mint(DUMMY_TX, 0, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      await moveForwardTwoWeeks();

      await donations.connect(owner).burn(0);

      expect(
        await donations.transferableAmounts(underlying.address, CHARITY_ID)
      ).to.equal(parseUnits("100"));
    });

    it("fails if the caller is the admin and the NFT has not expired", async () => {
      const ttl = BigNumber.from(time.duration.days(20).toNumber());
      await donations.setTTL(ttl);

      await donations.mint(DUMMY_TX, 0, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      await moveForwardTwoWeeks();

      await expect(donations.connect(owner).burn(0)).to.be.revertedWith(
        "Donations: not allowed"
      );
    });

    it("emits an event", async () => {
      await donations.mint(DUMMY_TX, 0, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      const tx = donations.connect(alice).burn(0);

      await expect(tx).to.emit(donations, "DonationBurned").withArgs(0);
    });

    it("fails if the caller is not the owner nor the admin", async () => {
      await donations.mint(DUMMY_TX, 0, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("100"),
          owner: alice.address,
          token: underlying.address,
        }),
      ]);

      await expect(donations.connect(bob).burn(0)).to.be.revertedWith(
        "Donations: not allowed"
      );
    });
  });

  describe("mint", () => {
    it("mints an NFT for every donation", async () => {
      await donations.mint(DUMMY_TX, 0, [
        donationParams.build(),
        donationParams.build(),
        donationParams.build(),
        donationParams.build(),
      ]);

      expect(await donations.metadata(0)).to.be.ok;
      expect(await donations.metadata(1)).to.be.ok;
      expect(await donations.metadata(2)).to.be.ok;
      expect(await donations.metadata(3)).to.be.ok;
    });

    it("mints the correct NFT", async () => {
      await donations.mint(DUMMY_TX, 0, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("1"),
          token: underlying.address,
          owner: owner.address,
        }),
      ]);

      expect(await donations.ownerOf(0)).to.equal(owner.address);

      const donation = await donations.metadata(0);

      expect(donation.amount).to.equal(parseUnits("1"));
      expect(donation.destinationId).to.equal(CHARITY_ID);
      expect(donation.token).to.equal(underlying.address);
    });

    it("marks the donations group as processed", async () => {
      await donations.mint(DUMMY_TX, 0, [donationParams.build()]);

      const groupId = utils.solidityKeccak256(
        ["bytes32", "uint256"],
        [DUMMY_TX, 0]
      );

      expect(await donations.processedDonationsGroups(groupId)).to.equal(true);
    });

    it("emits an event", async () => {
      const ttl = BigNumber.from(time.duration.days(180).toNumber());

      await donations.setTTL(ttl);

      const tx = donations.mint(DUMMY_TX, 0, [
        donationParams.build({
          destinationId: CHARITY_ID,
          amount: parseUnits("1"),
          token: underlying.address,
          owner: owner.address,
        }),
      ]);

      const expiry = ttl.add(await getLastBlockTimestamp()).add(1);

      const groupId = utils.solidityKeccak256(
        ["bytes32", "uint256"],
        [DUMMY_TX, 0]
      );

      await expect(tx)
        .to.emit(donations, "DonationMinted")
        .withArgs(
          0,
          CHARITY_ID,
          groupId,
          underlying.address,
          expiry,
          parseUnits("1"),
          owner.address
        );
    });

    it("fails if the caller is not authorized", async () => {
      await expect(
        donations.connect(alice).mint(DUMMY_TX, 0, [
          donationParams.build({
            destinationId: CHARITY_ID,
            amount: parseUnits("1"),
            token: underlying.address,
            owner: owner.address,
          }),
        ])
      ).to.be.revertedWith(getRoleErrorMsg(alice, WORKER_ROLE));
    });

    it("fails if the donations group was already processed", async () => {
      await donations.mint(DUMMY_TX, 0, [donationParams.build()]);

      await expect(
        donations.mint(DUMMY_TX, 0, [donationParams.build()])
      ).to.be.revertedWith("Donations: already processed");
    });
  });
});
