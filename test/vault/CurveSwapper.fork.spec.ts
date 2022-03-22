import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, deployments } from "hardhat";
import { expect } from "chai";

import {
  TestCurveSwapper,
  TestCurveSwapper__factory,
  ERC20,
  ICurve,
  ICurve__factory,
  ERC20__factory,
} from "../../typechain";
import { ForkHelpers } from "../shared";

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

const FORK_BLOCK = 14023000;
const UST_ADDRESS = "0xa47c8bf37f92abed4a126bda807a7b7498661acd";
const USDT_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
const CURVE_UST_3CRV_POOL = "0x890f4e345b1daed0367a877a1612f86a1f86985f";

const curveIndexes = {
  ust: 0,
  dai: 1,
  usdc: 2,
  usdt: 3,
};

describe("CurveSwapper", () => {
  let owner: SignerWithAddress;

  let ust: ERC20;
  let dai: ERC20;
  let usdc: ERC20;
  let usdt: ERC20;
  let curvePool: ICurve;
  let swapper: TestCurveSwapper;

  let decimals: Record<string, number>;

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);
    [owner] = await ethers.getSigners();

    ust = ERC20__factory.connect(UST_ADDRESS, owner);
    dai = ERC20__factory.connect(DAI_ADDRESS, owner);
    usdc = ERC20__factory.connect(USDC_ADDRESS, owner);
    usdt = ERC20__factory.connect(USDT_ADDRESS, owner);
    curvePool = ICurve__factory.connect(CURVE_UST_3CRV_POOL, owner);

    decimals = {
      ust: await ust.decimals(),
      dai: await dai.decimals(),
      usdc: await usdc.decimals(),
      usdt: await usdt.decimals(),
    };

    swapper = await new TestCurveSwapper__factory(owner).deploy(
      ust.address,
      [dai.address, usdc.address, usdt.address],
      [curvePool.address, curvePool.address, curvePool.address],
      [curveIndexes.dai, curveIndexes.usdc, curveIndexes.usdt],
      [curveIndexes.ust, curveIndexes.ust, curveIndexes.ust]
    );

    await ForkHelpers.mintToken(ust, swapper, parseUnits("1000"));
    await ForkHelpers.mintToken(dai, swapper, parseUnits("1000"));
    await ForkHelpers.mintToken(usdc, swapper, parseUnits("1000"));
    await ForkHelpers.mintToken(usdt, swapper, parseUnits("1000"));
  });

  describe("swapToUnderlying", function () {
    it.only("swaps 100DAI for approximately 100UST", async () => {
      const input = parseUnits("100", decimals.dai);

      const action = () => swapper.test_swapIntoUnderlying(dai.address, input);

      await validateSwap(action, swapper, dai, ust, "100");
    });
    it("swaps 100USDC for approximately 100UST", async () => {});
    it("swaps 100USDT for approximately 100UST", async () => {});
  });

  describe("swapFromUnderlying", function () {
    it("swaps 100UST for approximately 100DAI", async () => {});
    it("swaps 100UST for approximately 100USDC", async () => {});
    it("swaps 100UST for approximately 100USDT", async () => {});
  });

  async function validateSwap(
    action: () => Promise<any>,
    account: { address: string },
    from: ERC20,
    to: ERC20,
    amount: string
  ) {
    const fromBalanceBefore = await from.balanceOf(account.address);
    const toBalanceBefore = await to.balanceOf(account.address);

    await action();

    const fromBalanceAfter = await from.balanceOf(account.address);
    const toBalanceAfter = await from.balanceOf(account.address);

    const deltaFrom = parseUnits(amount, await from.decimals());
    const deltaTo = parseUnits(amount, await to.decimals());

    const deltaToMargin = parseUnits("2", await to.decimals());

    expect(fromBalanceAfter).to.equal(fromBalanceBefore.sub(deltaFrom));
    expect(toBalanceAfter).to.be.closeTo(
      toBalanceBefore.add(deltaTo),
      deltaToMargin as unknown as number
    );
  }
});
