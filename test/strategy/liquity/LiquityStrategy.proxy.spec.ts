/**
 * Tests for the proxy functionality of the Liquity Strategy contract
 */

import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockStabilityPool,
  LiquityStrategy,
  MockLiquityStrategyV2,
  MockERC20,
  LiquityStrategy__factory,
  MockLiquityStrategyV2__factory,
} from '../../../typechain';

import { generateNewAddress } from '../../shared/';

const { parseEther } = utils;

describe('LiquityStrategy Proxy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let vault: Vault;
  let stabilityPool: MockStabilityPool;
  let strategy: LiquityStrategy;
  let strategyV2: MockLiquityStrategyV2;
  let underlying: MockERC20;
  let lqty: MockERC20;
  let testToken: MockERC20;

  let LiquityStrategyFactory: LiquityStrategy__factory;
  let MockLiquityStrategyV2Factory: MockLiquityStrategyV2__factory;

  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = 1;
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');
  const INVESTMENT_FEE_PCT = BigNumber.from('0');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;

  beforeEach(async () => {
    [admin, alice] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    underlying = await MockERC20.deploy(
      'LUSD',
      'LUSD',
      18,
      parseEther('1000000000'),
    );

    lqty = await MockERC20.deploy('LQTY', 'LQTY', 18, parseEther('1000000000'));
    testToken = await MockERC20.deploy(
      'TEST',
      'TEST',
      18,
      parseEther('1000000000'),
    );

    const StabilityPoolFactory = await ethers.getContractFactory(
      'MockStabilityPool',
    );

    stabilityPool = await StabilityPoolFactory.deploy(
      underlying.address,
      '0x0000000000000000000000000000000000000000',
    );

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      underlying.address,
      MIN_LOCK_PERIOD,
      INVEST_PCT,
      TREASURY,
      admin.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    LiquityStrategyFactory = await ethers.getContractFactory('LiquityStrategy');
    MockLiquityStrategyV2Factory = await ethers.getContractFactory(
      'MockLiquityStrategyV2',
    );

    const strategyProxy = await upgrades.deployProxy(
      LiquityStrategyFactory,
      [
        vault.address,
        admin.address,
        stabilityPool.address,
        lqty.address,
        underlying.address,
        admin.address, // keeper
        0,
        '0x81C46fECa27B31F3ADC2b91eE4be9717d1cd3DD7', // curve exchange
      ],
      {
        kind: 'uups',
      },
    );

    await strategyProxy.deployed();

    strategy = LiquityStrategyFactory.attach(strategyProxy.address);

    await vault.setStrategy(strategy.address);

    await underlying
      .connect(admin)
      .approve(vault.address, constants.MaxUint256);

    const strategyV2_proxy = await upgrades.upgradeProxy(
      strategy.address,
      MockLiquityStrategyV2Factory,
    );

    strategyV2 = MockLiquityStrategyV2Factory.attach(strategyV2_proxy.address);
  });

  describe('proxy', () => {
    it('strategy address is same after upgrade', async () => {
      expect(strategy.address).to.equal(strategyV2.address);
    });

    it('old storage parameters & values are unchanged after the upgrade', async () => {
      expect(await strategyV2.vault()).to.equal(vault.address);
      expect(await strategyV2.stabilityPool()).to.equal(stabilityPool.address);
      expect(await strategyV2.lqty()).to.equal(lqty.address);
      expect(await strategyV2.underlying()).to.equal(underlying.address);
    });

    it('old methods are unchanged', async () => {
      expect(await strategyV2.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await strategyV2.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .false;

      await strategyV2.connect(admin).transferAdminRights(alice.address);

      expect(await strategyV2.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .false;
      expect(await strategyV2.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .true;
    });

    it('new storage parameters & methods added work', async () => {
      expect(await strategyV2.getVersion()).to.equal(2);

      expect(await strategyV2.newToken()).to.equal(constants.AddressZero);
      await strategyV2.connect(admin).updateNewToken(testToken.address);
      expect(await strategyV2.newToken()).to.equal(testToken.address);
    });

    it('closing an old method works', async () => {
      await expect(strategyV2.harvest()).to.be.revertedWith('HarvestError');
    });
  });
});
