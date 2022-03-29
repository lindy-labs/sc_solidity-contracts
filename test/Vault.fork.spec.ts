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
import { ForkHelpers, getRoleErrorMsg } from "./shared";

const { formatUnits, parseUnits, keccak256, toUtf8Bytes, getAddress } =
  ethers.utils;
const { MaxUint256, HashZero, AddressZero } = ethers.constants;

const FORK_BLOCK = 14449700;
const UST_ADDRESS = "0xa47c8bf37f92abed4a126bda807a7b7498661acd";
const USDT_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
const CURVE_UST_3CRV_POOL = "0x890f4e345b1daed0367a877a1612f86a1f86985f";
const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());
const PERFORMANCE_FEE_PCT = BigNumber.from("200");
const INVEST_PCT = BigNumber.from("9000");
const DENOMINATOR = BigNumber.from("10000");
const DEFAULT_ADMIN_ROLE = HashZero;

const curveIndexes = {
  ust: 0,
  dai: 1,
  usdc: 2,
  usdt: 3,
};

describe("Vault (fork tests)", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  let ust: ERC20;
  let dai: ERC20;
  let usdc: ERC20;
  let usdt: ERC20;
  let curvePool: ICurve;
  let vault: Vault;

  let decimals: Record<string, number>;

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);
    [owner, alice] = await ethers.getSigners();

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

    vault = await new Vault__factory(owner).deploy(
      ust.address,
      TWO_WEEKS,
      INVEST_PCT,
      owner.address,
      owner.address,
      PERFORMANCE_FEE_PCT,
      [
        {
          token: dai.address,
          pool: curvePool.address,
          tokenI: curveIndexes.dai,
          underlyingI: curveIndexes.ust,
        },
        {
          token: usdc.address,
          pool: curvePool.address,
          tokenI: curveIndexes.usdc,
          underlyingI: curveIndexes.ust,
        },
      ]
    );
  });

  describe("addPool", function () {
    it("allows adding new valid pools", async () => {
      const action = await vault.addPool({
        token: usdt.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdt,
        underlyingI: curveIndexes.ust,
      });

      await expect(action).not.to.be.reverted;

      const pool = await vault.swappers(usdt.address);

      expect(pool[0]).to.equal(getAddress(usdt.address));
    });

    it("is not callable by a non-admin", async () => {
      const action = await vault.connect(alice).addPool({
        token: usdt.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdt,
        underlyingI: curveIndexes.ust,
      });

      await expect(action).to.be.revertedWith(
        getRoleErrorMsg(alice, DEFAULT_ADMIN_ROLE)
      );
    });
  });

  describe("removePool", function () {
    it("allows adding new valid pools", async () => {
      const action = await vault.removePool(dai.address);

      await expect(action).not.to.be.reverted;

      const pool = await vault.swappers(dai.address);

      expect(pool[0]).to.equal(AddressZero);
    });

    it("is not callable by a non-admin", async () => {
      const action = await vault.connect(alice).removePool(dai.address);

      await expect(action).to.be.revertedWith(
        getRoleErrorMsg(alice, DEFAULT_ADMIN_ROLE)
      );
    });
  });

  describe("deposit with DAI", function () {
    it("automatically swaps into UST and deposits that", async () => {});
  });
});
