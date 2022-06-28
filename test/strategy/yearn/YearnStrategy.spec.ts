import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockYearnVault,
  YearnStrategy,
  MockERC20,
  YearnStrategy__factory,
} from '../../../typechain';

import { generateNewAddress } from '../../shared/';
import { depositParams, claimParams } from '../../shared/factories';
import { parseUnits } from 'ethers/lib/utils';

const { parseEther } = utils;

describe('YearnStrategy', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let yVault: MockYearnVault;
  let strategy: YearnStrategy;
  let underlying: MockERC20;

  let YearnStrategyFactory: YearnStrategy__factory;

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

    const YVaultFactory = await ethers.getContractFactory('MockYearnVault');

    yVault = await YVaultFactory.deploy(
      'Yearn LUSD Vault',
      'yLusd',
      underlying.address,
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

    YearnStrategyFactory = await ethers.getContractFactory('YearnStrategy');

    strategy = await YearnStrategyFactory.deploy(
      vault.address,
      owner.address,
      yVault.address,
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
        YearnStrategyFactory.deploy(
          vault.address,
          constants.AddressZero,
          yVault.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyOwnerCannotBe0Address');
    });

    it('reverts if the yearn vault is address(0)', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          vault.address,
          owner.address,
          constants.AddressZero,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyYearnVaultCannotBe0Address');
    });

    it('reverts if underlying is address(0)', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          vault.address,
          owner.address,
          yVault.address,
          constants.AddressZero,
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it('reverts if vault does not have IVault interface', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          manager.address,
          owner.address,
          yVault.address,
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
      expect(await strategy.yVault()).to.eq(yVault.address);

      expect(await strategy.underlying()).to.eq(underlying.address);
      expect(await strategy.hasAssets()).to.be.false;
      expect(
        await underlying.allowance(strategy.address, strategy.address),
      ).to.eq(constants.MaxUint256);
    });
  });

  describe('#invest function', () => {
    it('reverts if msg.sender is not manager', async () => {
      await expect(strategy.connect(alice).invest()).to.be.revertedWith(
        'StrategyCallerNotManager',
      );
    });

    it('reverts if underlying balance is zero', async () => {
      await expect(strategy.connect(manager).invest()).to.be.revertedWith(
        'StrategyNoUnderlying',
      );
    });

    it('deposits underlying from the vault to the yVault', async () => {
      let underlyingAmount = utils.parseUnits('100', 18);
      await depositToVault(underlyingAmount);

      expect(await vault.totalUnderlying()).to.eq(underlyingAmount);
      expect(await strategy.investedAssets()).to.eq(0);
      expect(await strategy.hasAssets()).be.false;

      await vault.connect(owner).updateInvested();

      expect(await underlying.balanceOf(yVault.address)).to.eq(
        underlyingAmount,
      );
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await strategy.investedAssets()).to.eq(underlyingAmount);
      expect(await strategy.hasAssets()).be.true;
      expect(await vault.totalUnderlying()).to.eq(underlyingAmount);
    });

    it('emits a StrategyInvested event', async () => {
      let underlyingAmount = utils.parseUnits('100', 18);
      await depositToVault(underlyingAmount);

      const tx = await vault.connect(owner).updateInvested();

      await expect(tx)
        .to.emit(strategy, 'StrategyInvested')
        .withArgs(underlyingAmount);
    });

    it('can be called multiple times', async () => {
      await depositToVault(utils.parseUnits('100', 18));
      await vault.connect(owner).updateInvested();

      await depositToVault(utils.parseUnits('10', 18));
      await vault.connect(owner).updateInvested();

      const totalUnderlying = utils.parseUnits('110', 18).sub('37');

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await strategy.investedAssets()).to.eq(totalUnderlying);
      expect(await vault.totalUnderlying()).to.eq(totalUnderlying);
    });
  });

  describe('#withdrawToVault function', () => {
    it('reverts if msg.sender is not manager', async () => {
      await expect(
        strategy.connect(alice).withdrawToVault(1),
      ).to.be.revertedWith('StrategyCallerNotManager');
    });

    it('reverts if amount is zero', async () => {
      await expect(
        strategy.connect(manager).withdrawToVault(0),
      ).to.be.revertedWith('StrategyAmountZero');
    });

    it('removes the requested funds from the yVault', async () => {
      await depositToVault(parseEther('100'));
      await vault.connect(owner).updateInvested();

      const amountToWithdraw = parseEther('30');

      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      expect(await yVault.balanceOf(strategy.address)).to.eq(parseEther('70'));
      expect(await strategy.investedAssets()).to.eq(parseEther('70'));
    });

    it('emits an event', async () => {
      await depositToVault(parseEther('100'));
      await vault.connect(owner).updateInvested();

      const amountToWithdraw = parseEther('30');

      let tx = await strategy
        .connect(manager)
        .withdrawToVault(amountToWithdraw);

      await expect(tx)
        .to.emit(strategy, 'StrategyWithdrawn')
        .withArgs(amountToWithdraw);
    });
  });

  const depositToVault = async (amount: BigNumber) => {
    await vault.connect(owner).deposit(
      depositParams.build({
        amount,
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(owner.address).build()],
      }),
    );
  };
});
