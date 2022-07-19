import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockStabilityPool,
  LiquityStrategy,
  OptimalSwapper,
  MockERC20,
  LiquityStrategy__factory,
} from '../../../typechain';

import { generateNewAddress } from '../../shared/';
import { depositParams, claimParams } from '../../shared/factories';

const { parseEther } = utils;

describe('LiquityStrategy', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let stabilityPool: MockStabilityPool;
  let optimalSwapper: OptimalSwapper;
  let strategy: LiquityStrategy;
  let underlying: MockERC20;
  let lqty: MockERC20;
  let usdc: MockERC20;
  let weth: MockERC20;

  let LiquityStrategyFactory: LiquityStrategy__factory;

  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = 1;
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');
  const INVESTMENT_FEE_PCT = BigNumber.from('0');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    [owner, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    underlying = await MockERC20.deploy(
      'LUSD',
      'LUSD',
      18,
      parseEther('1000000000'),
    );

    lqty = await MockERC20.deploy('LQTY', 'LQTY', 18, parseEther('1000000000'));

    usdc = await MockERC20.deploy('USDC', 'USDC', 18, parseEther('1000000000'));

    weth = await MockERC20.deploy('WETH', 'WETH', 18, parseEther('1000000000'));

    const StabilityPoolFactory = await ethers.getContractFactory(
      'MockStabilityPool',
    );
    stabilityPool = await StabilityPoolFactory.deploy();

    const OptimalSwapper = await ethers.getContractFactory('OptimalSwapper');
    optimalSwapper = await OptimalSwapper.deploy(
      constants.AddressZero,
      constants.AddressZero,
    );

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      underlying.address,
      MIN_LOCK_PERIOD,
      INVEST_PCT,
      TREASURY,
      owner.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    LiquityStrategyFactory = await ethers.getContractFactory('LiquityStrategy');

    strategy = await LiquityStrategyFactory.deploy(
      vault.address,
      owner.address,
      stabilityPool.address,
      optimalSwapper.address,
      lqty.address,
      usdc.address,
      weth.address,
      underlying.address,
    );

    await strategy.connect(owner).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);

    await underlying
      .connect(owner)
      .approve(vault.address, constants.MaxUint256);
  });

  describe('#constructor', () => {
    it('reverts if owner is address(0)', async () => {
      await expect(
        LiquityStrategyFactory.deploy(
          vault.address,
          constants.AddressZero,
          stabilityPool.address,
          optimalSwapper.address,
          lqty.address,
          usdc.address,
          weth.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyOwnerCannotBe0Address');
    });

    it('reverts if stabilityPool is address(0)', async () => {
      await expect(
        LiquityStrategyFactory.deploy(
          vault.address,
          owner.address,
          constants.AddressZero,
          optimalSwapper.address,
          lqty.address,
          usdc.address,
          weth.address,

          underlying.address,
        ),
      ).to.be.revertedWith('LiquityStabilityPoolCannotBeAddressZero');
    });

    it('reverts if optimalSwapper is address(0)', async () => {
      await expect(
        LiquityStrategyFactory.deploy(
          vault.address,
          owner.address,
          stabilityPool.address,
          constants.AddressZero,
          lqty.address,
          usdc.address,
          weth.address,

          underlying.address,
        ),
      ).to.be.revertedWith('OptimalSwapperCanntoBe0Address');
    });

    it('reverts if lqty is address(0)', async () => {
      await expect(
        LiquityStrategyFactory.deploy(
          vault.address,
          owner.address,
          stabilityPool.address,
          optimalSwapper.address,
          constants.AddressZero,
          usdc.address,
          weth.address,

          underlying.address,
        ),
      ).to.be.revertedWith('StrategyYieldTokenCannotBe0Address');
    });

    it('reverts if usdc is address(0)', async () => {
      await expect(
        LiquityStrategyFactory.deploy(
          vault.address,
          owner.address,
          stabilityPool.address,
          optimalSwapper.address,
          lqty.address,
          constants.AddressZero,
          weth.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyYieldTokenCannotBe0Address');
    });

    it('reverts if weth is address(0)', async () => {
      await expect(
        LiquityStrategyFactory.deploy(
          vault.address,
          owner.address,
          stabilityPool.address,
          optimalSwapper.address,
          lqty.address,
          usdc.address,
          constants.AddressZero,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyYieldTokenCannotBe0Address');
    });

    it('reverts if underlying is address(0)', async () => {
      await expect(
        LiquityStrategyFactory.deploy(
          vault.address,
          owner.address,
          stabilityPool.address,
          optimalSwapper.address,
          lqty.address,
          usdc.address,
          weth.address,
          constants.AddressZero,
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it('reverts if vault does not have IVault interface', async () => {
      await expect(
        LiquityStrategyFactory.deploy(
          manager.address,
          owner.address,
          stabilityPool.address,
          optimalSwapper.address,
          lqty.address,
          usdc.address,
          weth.address,

          underlying.address,
        ),
      ).to.be.revertedWith('StrategyNotIVault');
    });

    it('checks initial values', async () => {
      expect(await strategy.isSync()).to.be.true;
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be
        .true;
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.true;
      expect(await strategy.vault()).to.eq(vault.address);
      expect(await strategy.stabilityPool()).to.eq(stabilityPool.address);

      expect(await strategy.underlying()).to.eq(underlying.address);

      // TODO: this is commented because hasAssets uses optimalSwapper & we are not sure about using that
      // expect(await strategy.hasAssets()).to.be.false;
      expect(
        await underlying.allowance(strategy.address, stabilityPool.address),
      ).to.eq(constants.MaxUint256);

      expect(
        await underlying.allowance(strategy.address, optimalSwapper.address),
      ).to.eq(constants.MaxUint256);

      expect(
        await lqty.allowance(strategy.address, optimalSwapper.address),
      ).to.eq(constants.MaxUint256);

      expect(
        await usdc.allowance(strategy.address, optimalSwapper.address),
      ).to.eq(constants.MaxUint256);

      expect(
        await weth.allowance(strategy.address, optimalSwapper.address),
      ).to.eq(constants.MaxUint256);
    });
  });

  describe('#transferOwnership', () => {
    it('can only be called by the current owner', async () => {
      await expect(
        strategy.connect(alice).transferOwnership(alice.address),
      ).to.be.revertedWith('StrategyCallerNotOwner');
    });

    it('reverts if new owner is address(0)', async () => {
      await expect(
        strategy.connect(owner).transferOwnership(constants.AddressZero),
      ).to.be.revertedWith('StrategyOwnerCannotBe0Address');
    });

    it('reverts if the new owner is the same as the current one', async () => {
      await expect(
        strategy.connect(owner).transferOwnership(owner.address),
      ).to.be.revertedWith('StrategyCannotTransferOwnershipToSelf');
    });

    // it('changes ownership to the new owner', async () => {
    //   await strategy.connect(owner).transferOwnership(alice.address);

    //   expect(await strategy.owner()).to.be.equal(alice.address);
    // });

    it("revokes previous owner's ADMIN role and sets up ADMIN role for the new owner", async () => {
      // assert that the owner has the ADMIN role
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be
        .true;

      await strategy.connect(owner).transferOwnership(alice.address);

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be
        .false;

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .true;
    });
  });
});
