import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { Claimers } from "../../typechain";

import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber } from "ethers";

describe("Claimers", () => {
  let vault: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let claimers: Claimers;

  beforeEach(async () => {
    [vault, alice, bob, carol] = await ethers.getSigners();

    let Claimers = await ethers.getContractFactory("Claimers");

    claimers = (await Claimers.deploy(vault.address)) as Claimers;
  });

  describe("transferFrom", () => {
    it("transfers the claimer NFT to another account", async () => {
      await claimers.connect(vault).mint(bob.address);

      const tokenId = await claimers.tokenOf(bob.address.toLowerCase());

      expect(await claimers.ownerOf(tokenId)).to.equal(bob.address);

      await claimers
        .connect(bob)
        .transferFrom(bob.address, carol.address, tokenId);

      expect(await claimers.ownerOf(tokenId)).to.equal(carol.address);
    });

    it("fails if the destionation address already has an NFT", async () => {
      await claimers.connect(vault).mint(bob.address);
      await claimers.connect(vault).mint(carol.address);

      await expect(
        claimers.connect(bob).transferFrom(bob.address, carol.address, 1)
      ).to.be.revertedWith("Claimers: destination already has an NFT");
    });
  });

  describe("mint", () => {
    it("ensures there's only one NFT per address", async () => {
      const nftID = await claimers.connect(vault).mint(bob.address);
      const nft2ID = await claimers.connect(vault).mint(bob.address);

      expect(nftID.toString()).to.equal(nft2ID.toString());
    });

    it("fails when the caller is not the vault", async () => {
      expect(claimers.connect(bob).mint(bob.address)).to.be.revertedWith(
        "Claimers: not authorized"
      );
    });
  });
});
