import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';

import {
  TestCurveSwapper,
  TestCurveSwapper__factory,
  ERC20,
  ICurve,
  ICurve__factory,
  ERC20__factory,
} from '../../typechain';
import { ForkHelpers } from '../shared';

const { formatUnits, parseUnits, getAddress } = ethers.utils;
const { MaxUint256, AddressZero } = ethers.constants;

const FORK_BLOCK = 14449700;
const UST_ADDRESS = '0xa47c8bf37f92abed4a126bda807a7b7498661acd';
const USDT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const DAI_ADDRESS = '0x6b175474e89094c44da98b954eedeac495271d0f';
const CURVE_UST_3CRV_POOL = '0x890f4e345b1daed0367a877a1612f86a1f86985f';

const curveIndexes = {
  ust: 0,
  dai: 1,
  usdc: 2,
  usdt: 3,
};

describe('CurveSwapper', () => {
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

    swapper = await new TestCurveSwapper__factory(owner).deploy(ust.address, [
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
      {
        token: usdt.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdt,
        underlyingI: curveIndexes.ust,
      },
    ]);

    await ForkHelpers.mintToken(ust, swapper, parseUnits('100'));
    await ForkHelpers.mintToken(dai, swapper, parseUnits('100'));
    await ForkHelpers.mintToken(usdc, swapper, parseUnits('100'));
    await ForkHelpers.mintToken(usdt, swapper, parseUnits('100'));
  });

  describe('swapToUnderlying', function () {
    it('swaps 100DAI for approximately 100UST', async () => {
      const input = parseUnits('100', decimals.dai);
      const action = () => swapper.test_swapIntoUnderlying(dai.address, input);
      await validateSwap(action, swapper, dai, ust, '100');
    });

    it('swaps 100USDC for approximately 100UST', async () => {
      const input = parseUnits('100', decimals.usdc);
      const action = () => swapper.test_swapIntoUnderlying(usdc.address, input);
      await validateSwap(action, swapper, usdc, ust, '100');
    });

    it('swaps 100USDT for approximately 100UST', async () => {
      const input = parseUnits('100', decimals.usdt);
      const action = () => swapper.test_swapIntoUnderlying(usdt.address, input);
      await validateSwap(action, swapper, usdt, ust, '100');
    });
  });

  describe('swapFromUnderlying', function () {
    it('swaps 100UST for approximately 100DAI', async () => {
      const input = parseUnits('100', decimals.ust);
      const action = () => swapper.test_swapFromUnderlying(dai.address, input);
      await validateSwap(action, swapper, ust, dai, '100');
    });

    it('swaps 100UST for approximately 100USDC', async () => {
      const input = parseUnits('100', decimals.ust);
      const action = () => swapper.test_swapFromUnderlying(usdc.address, input);
      await validateSwap(action, swapper, ust, usdc, '100');
    });

    it('swaps 100UST for approximately 100USDT', async () => {
      const input = parseUnits('100', decimals.ust);
      const action = () => swapper.test_swapFromUnderlying(usdt.address, input);
      await validateSwap(action, swapper, ust, usdt, '100');
    });

    it('swaps 100UST for 100UST', async () => {
      const input = parseUnits('100', decimals.ust);
      const amountBefore = await ust.balanceOf(swapper.address);

      swapper.test_swapFromUnderlying(ust.address, input);

      const amountAfter = await ust.balanceOf(swapper.address);

      expect(amountAfter).to.eq(amountBefore);
    });
  });

  describe('removePool', function () {
    it('removes an existing pool', async () => {
      const action = swapper.test_removePool(usdt.address);

      await expect(action)
        .to.emit(swapper, 'CurveSwapPoolRemoved')
        .withArgs(getAddress(usdt.address));

      const pool = await swapper.swappers(usdt.address);

      expect(pool[0]).to.equal(AddressZero);
    });
  });

  describe('addPool', function () {
    it('adds a new pool', async () => {
      await swapper.test_removePool(usdt.address);

      const action = swapper.test_addPool({
        token: usdt.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdt,
        underlyingI: curveIndexes.ust,
      });

      await expect(action)
        .to.emit(swapper, 'CurveSwapPoolAdded')
        .withArgs(
          getAddress(usdt.address),
          getAddress(curvePool.address),
          curveIndexes.usdt,
          curveIndexes.ust,
        );

      const pool = await swapper.swappers(usdt.address);

      expect(pool[0]).to.equal(getAddress(curvePool.address));
    });

    it('fails to add an already existing token', async () => {
      const action = swapper.test_addPool({
        token: usdt.address,
        pool: curvePool.address,
        tokenI: curveIndexes.usdt,
        underlyingI: curveIndexes.ust,
      });

      await expect(action).to.be.revertedWith('token already has a swap pool');
    });
  });

  async function validateSwap(
    action: () => Promise<any>,
    account: { address: string },
    from: ERC20,
    to: ERC20,
    amount: string,
  ) {
    const fromBalanceBefore = await from.balanceOf(account.address);
    const toBalanceBefore = await to.balanceOf(account.address);

    await action();

    const fromBalanceAfter = await from.balanceOf(account.address);
    const toBalanceAfter = await to.balanceOf(account.address);

    const deltaFrom = parseUnits(amount, await from.decimals());
    const deltaTo = parseUnits(amount, await to.decimals());
    const deltaToMargin = parseUnits('1', await to.decimals());

    expect(fromBalanceAfter).to.equal(fromBalanceBefore.sub(deltaFrom));
    expect(toBalanceAfter).to.be.closeTo(
      toBalanceBefore.add(deltaTo),
      deltaToMargin as unknown as number,
    );
  }
});
