import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { expect } from 'chai';

import {
  Vault,
  Vault__factory,
  ERC20,
  ICurve,
  ICurve__factory,
  ERC20__factory,
} from '../../typechain';
import { ForkHelpers, getRoleErrorMsg, arrayFromTo } from '../shared';
import { depositParams, claimParams } from '../shared/factories';

const { parseUnits, getAddress } = ethers.utils;
const { MaxUint256, HashZero, AddressZero } = ethers.constants;

const FORK_BLOCK = 14449700;
const LUSD_ADDRESS = getAddress('0x5f98805A4E8be255a32880FDeC7F6728C6568bA0');
const USDC_ADDRESS = getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
const DAI_ADDRESS = getAddress('0x6b175474e89094c44da98b954eedeac495271d0f');
const CURVE_LUSD_3CRV_POOL = getAddress(
  '0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA',
);
const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());
const PERFORMANCE_FEE_PCT = BigNumber.from('200');
const INVEST_PCT = BigNumber.from('9000');
const INVESTMENT_FEE_PCT = BigNumber.from('200');
const DEFAULT_ADMIN_ROLE = HashZero;

const curveIndexes = {
  ust: 0,
  dai: 1,
  usdc: 2,
};

describe('Vault (fork tests)', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let lusd: ERC20;
  let dai: ERC20;
  let usdc: ERC20;
  let curvePool: ICurve;
  let vault: Vault;

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);
    [admin, alice, bob] = await ethers.getSigners();

    lusd = ERC20__factory.connect(LUSD_ADDRESS, admin);
    dai = ERC20__factory.connect(DAI_ADDRESS, admin);
    usdc = ERC20__factory.connect(USDC_ADDRESS, admin);
    curvePool = ICurve__factory.connect(CURVE_LUSD_3CRV_POOL, admin);

    vault = await new Vault__factory(admin).deploy(
      lusd.address,
      TWO_WEEKS,
      INVEST_PCT,
      admin.address,
      admin.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [
        {
          token: dai.address,
          pool: curvePool.address,
          tokenI: curveIndexes.dai,
          underlyingI: curveIndexes.ust,
        },
      ],
      0,
    );

    await ForkHelpers.mintToken(
      dai,
      alice,
      parseUnits('1000', await dai.decimals()),
    );
    await ForkHelpers.mintToken(
      usdc,
      alice,
      parseUnits('1000', await usdc.decimals()),
    );
    await ForkHelpers.mintToken(
      lusd,
      alice,
      parseUnits('1000', await lusd.decimals()),
    );
    dai.connect(alice).approve(vault.address, MaxUint256);
    usdc.connect(alice).approve(vault.address, MaxUint256);
    lusd.connect(alice).approve(vault.address, MaxUint256);
  });

  describe('addPool', function () {
    it('allows adding new valid pools', async () => {
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

    it('does not allow adding a pool where underlyingI does not match', async () => {
      const action = vault.addPool({
        token: usdc.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdc,
        underlyingI: curveIndexes.dai,
      });

      await expect(action).to.be.revertedWith('SwapperUnderlyingIndexMismatch');
    });

    it('is not callable by a non-admin', async () => {
      const action = vault.connect(alice).addPool({
        token: usdc.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdc,
        underlyingI: curveIndexes.ust,
      });

      await expect(action).to.be.revertedWith('VaultCallerNotAdmin');
    });
  });

  describe('removePool', function () {
    it('allows removing existing pools', async () => {
      const action = vault.removePool(dai.address);

      await expect(action).not.to.be.reverted;

      const pool = await vault.swappers(dai.address);

      expect(pool[0]).to.equal(AddressZero);
    });

    it("fails if the token doesn't exits", async () => {
      const action = vault.removePool(LUSD_ADDRESS);

      await expect(action).to.be.reverted;
    });

    it('is not callable by a non-admin', async () => {
      const action = vault.connect(alice).removePool(dai.address);

      await expect(action).to.be.revertedWith('VaultCallerNotAdmin');
    });
  });

  describe('deposit with DAI', function () {
    it('automatically swaps into LUSD and deposits that', async () => {
      const action = vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('1000', await dai.decimals()),
          inputToken: dai.address,
          claims: [claimParams.percent(100).to(bob.address).build()],
        }),
      );

      const expectedUnderlyingAmount = '995643944707865674480';

      await expect(action)
        .to.emit(vault, 'Swap')
        .withArgs(
          dai.address,
          lusd.address,
          parseUnits('1000', await dai.decimals()),
          expectedUnderlyingAmount,
        );

      expect((await vault.deposits(1)).amount).to.equal(
        expectedUnderlyingAmount,
      );
    });
  });

  describe('sponsor with DAI', function () {
    it('automatically swaps into LUSD and deposits that', async () => {
      // DAI and LUSD both have 18 decimals
      const sponsorAmount = parseUnits('1000');
      const minAmountOut = parseUnits('995');
      const expectedUnderlyingAmount = '995643944707865674480';
      await ForkHelpers.mintToken(dai, admin, sponsorAmount);
      await dai.connect(admin).approve(vault.address, MaxUint256);

      const action = vault
        .connect(admin)
        .sponsor(dai.address, sponsorAmount, TWO_WEEKS, minAmountOut);

      await expect(action)
        .to.emit(vault, 'Swap')
        .withArgs(
          dai.address,
          lusd.address,
          sponsorAmount,
          expectedUnderlyingAmount,
        );

      expect((await vault.deposits(1)).amount).to.equal(
        expectedUnderlyingAmount,
      );
    });
  });

  describe('deposit with USDC', function () {
    it('fails if USDC is not whitelisted', async () => {
      const action = vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('1000', await usdc.decimals()),
          inputToken: usdc.address,
          claims: [claimParams.percent(100).to(bob.address).build()],
        }),
      );

      await expect(action).to.be.reverted;
    });

    it('works after whitelisting USDC', async () => {
      await vault.addPool({
        token: usdc.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdc,
        underlyingI: curveIndexes.ust,
      });

      const action = vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('1000', await usdc.decimals()),
          inputToken: usdc.address,
          claims: arrayFromTo(1, 100).map(() =>
            claimParams.percent(1).to(bob.address).build(),
          ),
        }),
      );

      await expect(action)
        .to.emit(vault, 'Swap')
        .withArgs(
          usdc.address,
          lusd.address,
          parseUnits('1000', await usdc.decimals()),
          '995647617949853706650',
        );
    });
  });
});
