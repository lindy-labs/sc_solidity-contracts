import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, utils } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';

import {
  ForkHelpers,
  generateNewAddress,
  moveForwardTwoWeeks,
  removeDecimals,
} from '../../shared';

import {
  Vault,
  ERC20,
  ERC20__factory,
  IRyskLiquidityPool,
  IRyskLiquidityPool__factory,
  RyskStrategy,
} from '../../../typechain';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('Rysk Strategy (mainnet fork tests)', () => {
  let admin: SignerWithAddress;

  let vault: Vault;
  let ryskLiquidityPool: IRyskLiquidityPool;
  let usdc: ERC20;
  let strategy: RyskStrategy;

  const TWO_WEEKS = time.duration.days(14).toNumber();
  const INVEST_PCT = 10000; // set 100% for test
  const INVESTMENT_FEE_PCT = 0; // set 0% for test
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  // mainnet addresses
  const RYSK_LIQUIDITY_POOL = '0xC10B976C671Ce9bFf0723611F01422ACbAe100A5';
  const USDC = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';

  const FORK_BLOCK = 27322256;

  beforeEach(async () => {
    await ForkHelpers.forkToArbitrumMainnet(FORK_BLOCK);

    [admin] = await ethers.getSigners();

    ryskLiquidityPool = IRyskLiquidityPool__factory.connect(
      RYSK_LIQUIDITY_POOL,
      admin,
    );

    usdc = ERC20__factory.connect(USDC, admin);

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      usdc.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      admin.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    const RyskStrategyFactory = await ethers.getContractFactory('RyskStrategy');

    strategy = await RyskStrategyFactory.deploy(
      vault.address,
      admin.address,
      admin.address,
      RYSK_LIQUIDITY_POOL,
      usdc.address,
    );

    await vault.setStrategy(strategy.address);

    await usdc.connect(admin).approve(vault.address, MaxUint256);
    await strategy.connect(admin).grantRole(MANAGER_ROLE, admin.address);
  });

  it('should deposit', async () => {
    const amount = parseUnits('1000', 6);
    console.log('amount', amount.toString());
    await ForkHelpers.mintToken(usdc, strategy.address, amount);

    console.log(
      "strategy's usdc balance",
      await usdc.balanceOf(strategy.address),
    );

    console.log('pool address', await strategy.connect(admin).ryskLqPool());
    console.log('pool assets', await ryskLiquidityPool.getAssets());
    await strategy.connect(admin).invest();

    console.log(
      "strategy's usdc balance",
      await usdc.balanceOf(strategy.address),
    );

    const depositReceipt = await ryskLiquidityPool.depositReceipts(
      strategy.address,
    );
    console.log('deposit amount', depositReceipt.amount.toString());
    console.log('deposit epoch', depositReceipt.epoch.toString());

    const depositEpoch = await ryskLiquidityPool.connect(admin).depositEpoch();
    console.log('current deposit epoch', depositEpoch.toString());

    expect(await strategy.hasAssets()).to.be.true;
    expect(await strategy.investedAssets()).to.eq(amount);
  });
});
