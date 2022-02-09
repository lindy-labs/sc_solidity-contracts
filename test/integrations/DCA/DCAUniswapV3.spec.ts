import chai from "chai";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { solidity } from "ethereum-waffle";

import type { Contract } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { ERC20, TestDCAUniswapV3, MockVault } from "../../../typechain";
import { ContractFactory, BigNumber } from "ethers";

import { ForkHelpers, EventHelpers } from "../../shared";
import { depositParams, claimParams } from "../../shared/factories";

chai.use(solidity);

const { parseUnits, formatUnits } = ethers.utils;

describe.skip("DCAUniswapV3", () => {
  const USDC_CONTRACT = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const WETH_CONTRACT = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

  let TestDCAUniswapV3: ContractFactory;
  let MockVault: ContractFactory;

  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let usdc: ERC20;
  let weth: ERC20;

  let dca: TestDCAUniswapV3;
  let vault: MockVault;
  const period = 30 * 24 * 60 * 60; // 30 days

  const margin = parseUnits("0.001") as unknown as number;
  const usdcMargin = parseUnits("1", 6) as unknown as number;

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(13778740);

    TestDCAUniswapV3 = await ethers.getContractFactory("TestDCAUniswapV3");
    MockVault = await ethers.getContractFactory("MockVault");

    [alice, bob, carol] = await ethers.getSigners();

    usdc = (await ethers.getContractAt("ERC20", USDC_CONTRACT)) as ERC20;
    weth = (await ethers.getContractAt("ERC20", WETH_CONTRACT)) as ERC20;

    vault = (await MockVault.deploy(usdc.address, 0, 0)) as MockVault;

    dca = (await TestDCAUniswapV3.deploy(
      vault.address,
      weth.address,
      ethers.utils.solidityPack(
        ["address", "uint24", "address"],
        [usdc.address, 3000, weth.address]
      ),
      period
    )) as TestDCAUniswapV3;

    await usdc
      .connect(alice)
      .approve(vault.address, parseUnits("1000000000", 6));
    await usdc.connect(bob).approve(vault.address, parseUnits("1000000000", 6));

    await ForkHelpers.setTokenBalance(usdc, alice, parseUnits("20000", 6));
    await ForkHelpers.setTokenBalance(usdc, bob, parseUnits("20000", 6));
  });

  after(async () => {
    await ForkHelpers.unfork();
  });

  describe("_swap", () => {
    it("moves WETH to the DCA contract", async () => {
      await ForkHelpers.mintToken(usdc, dca, parseUnits("100", 6));

      await dca.test_swap(0, 1732210013);

      // TODO probably better to test with events
      expect(await weth.balanceOf(dca.address)).to.be.closeTo(
        parseUnits("0.025"),
        margin
      );
    });
  });

  describe("executeSwap", () => {
    it("executes a swap", async () => {
      await vault
        .connect(alice)
        .deposit(depositWithDCAClaim(parseUnits("1000", 6), bob.address));
      await ForkHelpers.mintToken(usdc, vault, parseUnits("100", 6));

      await dca.executeSwap(0, 1732210013);

      expect(await weth.balanceOf(dca.address)).to.be.closeTo(
        parseUnits("0.025"),
        margin
      );
    });

    it("is not callable by a non-trusted account", async () => {
      await vault
        .connect(alice)
        .deposit(depositWithDCAClaim(parseUnits("1000", 6), bob.address));
      await ForkHelpers.mintToken(usdc, vault, parseUnits("100", 6));

      const action = dca.connect(bob).executeSwap(0, 1732210013);

      await expect(action).to.be.revertedWith("UNTRUSTED");
    });

    it("works if _minRate is met", async () => {
      await vault
        .connect(alice)
        .deposit(depositWithDCAClaim(parseUnits("1000", 6), bob.address));
      await ForkHelpers.mintToken(usdc, vault, parseUnits("4000", 6));

      // ask for a rate of 4000 USDC / ETH
      const oneUsdc = parseUnits("1", 6);
      const oneEth = parseUnits("1");
      const minRate = oneEth.mul(oneEth).div(oneUsdc.mul(4000));

      const action = dca.executeSwap(minRate, 1732210013);

      await expect(action).not.to.be.reverted;
    });

    it("fails if _minRate is not met", async () => {
      await vault
        .connect(alice)
        .deposit(depositWithDCAClaim(parseUnits("1000", 6), bob.address));
      await ForkHelpers.mintToken(usdc, vault, parseUnits("4000", 6));

      // ask for a rate of 2000 USDC / ETH
      const oneUsdc = parseUnits("1", 6);
      const oneEth = parseUnits("1");
      const minRate = oneEth.mul(oneEth).div(oneUsdc.mul(2000));

      const action = dca.executeSwap(minRate, 1732210013);

      await expect(action).to.be.revertedWith("Too little received");
    });
  });

  describe("per-user amounts", () => {
    it("tracks amounts per user", async () => {
      // alice deposits 1000 USDC, donates DCA to bob
      await vault
        .connect(alice)
        .deposit(depositWithDCAClaim(parseUnits("1000", 6), bob.address));

      // alice deposits another 2000 USDC, donates DCA to carol
      await vault
        .connect(alice)
        .deposit(depositWithDCAClaim(parseUnits("2000", 6), carol.address));

      // 4000 USDC of yield generated
      await ForkHelpers.mintToken(usdc, vault, parseUnits("4000", 6));

      // execute DCA
      await dca.executeSwap(0, 1732210013);

      const totalWeth = await weth.balanceOf(dca.address);

      // both bob and carol claim their DCA'd amount
      await dca.connect(bob).withdraw();
      await dca.connect(carol).withdraw();

      // bob should get 1/3 of the total, and carol should get 2/3
      expect(await weth.balanceOf(bob.address)).to.be.closeTo(
        totalWeth.div("3"),
        margin
      );
      expect(await weth.balanceOf(carol.address)).to.be.closeTo(
        totalWeth.div("3").mul("2"),
        margin
      );
    });

    it("tracks amounts per user when investments come from different acounts", async () => {
      // alice deposits 1000 USDC, donates DCA to carol
      await vault
        .connect(alice)
        .deposit(depositWithDCAClaim(parseUnits("1000", 6), carol.address));

      // bob deposits another 2000 USDC, also donates DCA to carol
      await vault
        .connect(bob)
        .deposit(depositWithDCAClaim(parseUnits("2000", 6), carol.address));

      // 4000 USDC of yield generated
      await ForkHelpers.mintToken(usdc, vault, parseUnits("4000", 6));

      // execute DCA
      await dca.executeSwap(0, 1732210013);

      const totalWeth = await weth.balanceOf(dca.address);

      // both bob and carol claim their DCA'd amount
      await dca.connect(carol).withdraw();

      // carol should get all of the total
      expect(await weth.balanceOf(carol.address)).to.eq(totalWeth);
    });

    it("emits an event", async () => {
      await vault
        .connect(alice)
        .deposit(depositWithDCAClaim(parseUnits("1000", 6), carol.address));

      await ForkHelpers.mintToken(usdc, vault, parseUnits("4000", 6));

      const action = dca.executeSwap(0, 1732210013);

      // TODO probably better to test with events
      await expect(action)
        .to.emit(dca, "SwapExecuted")
        .withArgs(0, parseUnits("4000", 6), parseUnits("1.005569404221971647"));
    });
  });

  function depositWithDCAClaim(
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
