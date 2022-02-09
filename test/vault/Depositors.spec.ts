import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { Depositors } from "../../typechain";

import { ethers } from "hardhat";
import { expect } from "chai";

describe("Depositors", () => {
  let vault: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let depositors: Depositors;

  beforeEach(async () => {
    [vault, alice, bob] = await ethers.getSigners();

    let Depositors = await ethers.getContractFactory("Depositors");

    depositors = (await Depositors.deploy(
      vault.address,
      "deposit",
      "DEP"
    )) as Depositors;
  });

  describe("mint", () => {
    it("fails when the caller is not the vault", async () => {
      expect(depositors.connect(bob).mint(bob.address)).to.be.revertedWith(
        "Depositors: not authorized"
      );
    });
  });
});
