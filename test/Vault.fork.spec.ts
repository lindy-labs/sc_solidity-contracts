import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { time } from "@openzeppelin/test-helpers";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { expect } from "chai";

import {
  Vault,
  Vault__factory,
  ERC20,
  ICurve,
  ICurve__factory,
  ERC20__factory,
} from "../typechain";
import { ForkHelpers, getRoleErrorMsg, arrayFromTo } from "./shared";
import { depositParams, claimParams } from "./shared/factories";

const { formatUnits, parseUnits, getAddress } = ethers.utils;
const { MaxUint256, HashZero, AddressZero } = ethers.constants;

const FORK_BLOCK = 14449700;
const UST_ADDRESS = getAddress("0xa47c8bf37f92abed4a126bda807a7b7498661acd");
const USDC_ADDRESS = getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const DAI_ADDRESS = getAddress("0x6b175474e89094c44da98b954eedeac495271d0f");
const CURVE_UST_3CRV_POOL = getAddress(
  "0x890f4e345b1daed0367a877a1612f86a1f86985f"
);
const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());
const PERFORMANCE_FEE_PCT = BigNumber.from("200");
const INVEST_PCT = BigNumber.from("9000");
const INVESTMENT_FEE_PCT = BigNumber.from("200");
const DENOMINATOR = BigNumber.from("10000");
const DEFAULT_ADMIN_ROLE = HashZero;

const curveIndexes = {
  ust: 0,
  dai: 1,
  usdc: 2,
};

describe("Vault (fork tests)", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let ust: ERC20;
  let dai: ERC20;
  let usdc: ERC20;
  let curvePool: ICurve;
  let vault: Vault;

  let decimals: Record<string, number>;

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);
    [owner, alice, bob] = await ethers.getSigners();

    ust = ERC20__factory.connect(UST_ADDRESS, owner);
    dai = ERC20__factory.connect(DAI_ADDRESS, owner);
    usdc = ERC20__factory.connect(USDC_ADDRESS, owner);
    curvePool = ICurve__factory.connect(CURVE_UST_3CRV_POOL, owner);

    decimals = {
      ust: await ust.decimals(),
      dai: await dai.decimals(),
      usdc: await usdc.decimals(),
    };

    vault = await new Vault__factory(owner).deploy(
      ust.address,
      TWO_WEEKS,
      INVEST_PCT,
      owner.address,
      owner.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [
        {
          token: dai.address,
          pool: curvePool.address,
          tokenI: curveIndexes.dai,
          underlyingI: curveIndexes.ust,
        },
      ]
    );

    await ForkHelpers.mintToken(
      dai,
      alice,
      parseUnits("1000", await dai.decimals())
    );
    await ForkHelpers.mintToken(
      usdc,
      alice,
      parseUnits("1000", await usdc.decimals())
    );
    await ForkHelpers.mintToken(
      ust,
      alice,
      parseUnits("1000", await ust.decimals())
    );
    dai.connect(alice).approve(vault.address, MaxUint256);
    usdc.connect(alice).approve(vault.address, MaxUint256);
    ust.connect(alice).approve(vault.address, MaxUint256);
  });

  describe("addPool", function () {
    it("allows adding new valid pools", async () => {
      const action = vault.addPool({
        token: usdc.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdc,
        underlyingI: curveIndexes.ust,
      });

      await expect(action).not.to.be.reverted;

      const pool = await vault.swappers(usdc.address);

      expect(pool[0]).to.equal(curvePool.address);
    });

    it("does not allow adding a pool where underlyingI does not match", async () => {
      const action = vault.addPool({
        token: usdc.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdc,
        underlyingI: curveIndexes.dai,
      });

      await expect(action).to.be.revertedWith(
        "_underlyingI does not match underlying token"
      );
    });

    it("is not callable by a non-admin", async () => {
      const action = vault.connect(alice).addPool({
        token: usdc.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdc,
        underlyingI: curveIndexes.ust,
      });

      await expect(action).to.be.revertedWith(
        getRoleErrorMsg(alice, DEFAULT_ADMIN_ROLE)
      );
    });
  });

  describe("removePool", function () {
    it("allows removing existing pools", async () => {
      const action = vault.removePool(dai.address);

      await expect(action).not.to.be.reverted;

      const pool = await vault.swappers(dai.address);

      expect(pool[0]).to.equal(AddressZero);
    });

    it("is not callable by a non-admin", async () => {
      const action = vault.connect(alice).removePool(dai.address);

      await expect(action).to.be.revertedWith(
        getRoleErrorMsg(alice, DEFAULT_ADMIN_ROLE)
      );
    });
  });

  describe("deposit with DAI", function () {
    it("automatically swaps into UST and deposits that", async () => {
      const action = vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits("1000", await dai.decimals()),
          inputToken: dai.address,
          claims: [claimParams.percent(100).to(bob.address).build()],
        })
      );

      const expectedUnderlyingAmount = "998093178708890943065";

      await expect(action)
        .to.emit(vault, "Swap")
        .withArgs(
          dai.address,
          ust.address,
          parseUnits("1000", await dai.decimals()),
          expectedUnderlyingAmount
        );

      expect((await vault.deposits(1)).amount).to.equal(
        expectedUnderlyingAmount
      );
    });
  });

  describe("deposit with DAI", function () {
    it("fails if USDT is not whitelisted", async () => {
      const action = vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits("1000", await usdc.decimals()),
          inputToken: usdc.address,
          claims: [claimParams.percent(100).to(bob.address).build()],
        })
      );

      await expect(action).to.be.reverted;
    });

    it("works after whitelisting USDC", async () => {
      await vault.addPool({
        token: usdc.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdc,
        underlyingI: curveIndexes.ust,
      });

      const action = vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits("1000", await usdc.decimals()),
          inputToken: usdc.address,
          claims: arrayFromTo(1, 100).map(() =>
            claimParams.percent(1).to(bob.address).build()
          ),
        })
      );

      await expect(action)
        .to.emit(vault, "Swap")
        .withArgs(
          usdc.address,
          ust.address,
          parseUnits("1000", await usdc.decimals()),
          "998096860985047176646"
        );
    });
  });
});
