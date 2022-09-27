import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
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

describe('YearnStrategy', () => {
  let admin: SignerWithAddress;
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
  const SETTINGS_ROLE = utils.keccak256(utils.toUtf8Bytes('SETTINGS_ROLE'));
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    [admin, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    underlying = await MockERC20.deploy(
      'LUSD',
      'LUSD',
      18,
      parseUnits('1000000000'),
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
      admin.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    YearnStrategyFactory = await ethers.getContractFactory('YearnStrategy');

    strategy = await YearnStrategyFactory.deploy(
      vault.address,
      admin.address,
      yVault.address,
      underlying.address,
    );

    await strategy.connect(admin).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);

    await underlying
      .connect(admin)
      .approve(vault.address, constants.MaxUint256);
  });

  describe('#constructor', () => {
    it.skip('reverts if admin is address(0)', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          vault.address,
          constants.AddressZero,
          yVault.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyAdminCannotBe0Address');
    });

    it.skip('reverts if the yearn vault is address(0)', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          vault.address,
          admin.address,
          constants.AddressZero,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyYearnVaultCannotBe0Address');
    });

    it.skip('reverts if underlying is address(0)', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          vault.address,
          admin.address,
          yVault.address,
          constants.AddressZero,
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it.skip('reverts if vault does not have IVault interface', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          manager.address,
          admin.address,
          yVault.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyNotIVault');
    });

    it.skip('checks initial values', async () => {
      expect(await strategy.isSync()).to.be.true;
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await strategy.hasRole(SETTINGS_ROLE, admin.address)).to.be.true;
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.true;
      expect(await strategy.vault()).to.eq(vault.address);
      expect(await strategy.yVault()).to.eq(yVault.address);

      expect(await strategy.underlying()).to.eq(underlying.address);
      expect(await strategy.hasAssets()).to.be.false;
      expect(
        await underlying.allowance(strategy.address, yVault.address),
      ).to.eq(constants.MaxUint256);
    });
  });

  describe('#transferAdminRights', () => {
    it.skip('reverts if caller is not admin', async () => {
      await expect(
        strategy.connect(alice).transferAdminRights(alice.address),
      ).to.be.revertedWith('StrategyCallerNotAdmin');
    });

    it.skip('reverts if new admin is address(0)', async () => {
      await expect(
        strategy.connect(admin).transferAdminRights(constants.AddressZero),
      ).to.be.revertedWith('StrategyAdminCannotBe0Address');
    });

    it.skip('reverts if the new admin is the same as the current one', async () => {
      await expect(
        strategy.connect(admin).transferAdminRights(admin.address),
      ).to.be.revertedWith('StrategyCannotTransferAdminRightsToSelf');
    });

    it.skip('changes admin account to the new admin account', async () => {
      let DEFAULT_ADMIN_ROLE = await strategy.DEFAULT_ADMIN_ROLE();
      expect(
        await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address),
      ).to.be.equal(false);
      await strategy.connect(admin).transferAdminRights(alice.address);
      expect(
        await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address),
      ).to.be.equal(true);
    });

    it.skip("revokes previous admin's roles and sets up the same roles for the new admin account", async () => {
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await strategy.hasRole(SETTINGS_ROLE, admin.address)).to.be.true;

      await strategy.connect(admin).transferAdminRights(alice.address);

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .false;
      expect(await strategy.hasRole(SETTINGS_ROLE, admin.address)).to.be.false;

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .true;
      expect(await strategy.hasRole(SETTINGS_ROLE, alice.address)).to.be.true;
    });
  });

  describe('#invest function', () => {
    it.skip('reverts if msg.sender is not manager', async () => {
      await expect(strategy.connect(alice).invest()).to.be.revertedWith(
        'StrategyCallerNotManager',
      );
    });

    it.skip('reverts if underlying balance is zero', async () => {
      await expect(strategy.connect(manager).invest()).to.be.revertedWith(
        'StrategyNoUnderlying',
      );
    });

    it.skip('deposits underlying from the vault to the yVault', async () => {
      let underlyingAmount = parseUnits('100', 18);
      await depositToVault(underlyingAmount);

      expect(await vault.totalUnderlying()).to.eq(underlyingAmount);
      expect(await strategy.investedAssets()).to.eq(0);
      expect(await strategy.hasAssets()).be.false;

      await vault.connect(admin).updateInvested();

      expect(await underlying.balanceOf(yVault.address)).to.eq(
        underlyingAmount,
      );
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await strategy.investedAssets()).to.eq(underlyingAmount);
      expect(await strategy.hasAssets()).be.true;
      expect(await vault.totalUnderlying()).to.eq(underlyingAmount);
    });

    it.skip('emits a StrategyInvested event', async () => {
      let underlyingAmount = parseUnits('100', 18);
      await depositToVault(underlyingAmount);

      const tx = await vault.connect(admin).updateInvested();

      await expect(tx)
        .to.emit(strategy, 'StrategyInvested')
        .withArgs(underlyingAmount);
    });

    it.skip('can be called multiple times', async () => {
      await depositToVault(parseUnits('100', 18));
      await vault.connect(admin).updateInvested();

      await depositToVault(parseUnits('10', 18));
      await vault.connect(admin).updateInvested();

      const totalUnderlying = parseUnits('110', 18).sub('37');

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await strategy.investedAssets()).to.eq(totalUnderlying);
      expect(await vault.totalUnderlying()).to.eq(totalUnderlying);
    });
  });

  describe('#withdrawToVault function', () => {
    it.skip('reverts if msg.sender is not manager', async () => {
      await expect(
        strategy.connect(alice).withdrawToVault(1),
      ).to.be.revertedWith('StrategyCallerNotManager');
    });

    it.skip('reverts if amount is zero', async () => {
      await expect(
        strategy.connect(manager).withdrawToVault(0),
      ).to.be.revertedWith('StrategyAmountZero');
    });

    it.skip('removes the requested funds from the yVault', async () => {
      await depositToVault(parseUnits('100'));
      await vault.connect(admin).updateInvested();

      const amountToWithdraw = parseUnits('30');

      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      expect(await yVault.balanceOf(strategy.address)).to.eq(parseUnits('70'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('70'));
    });

    it.skip('removes the requested funds from the strategy', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));

      await strategy.connect(manager).withdrawToVault(parseUnits('30'));

      expect(await yVault.balanceOf(strategy.address)).to.eq(parseUnits('0'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('70'));
      expect(await underlying.balanceOf(vault.address)).to.eq(parseUnits('30'));
    });

    it.skip('removes the requested funds from the strategy and the yVault', async () => {
      await depositToVault(parseUnits('100'));
      await vault.connect(admin).updateInvested();
      await underlying.mint(strategy.address, parseUnits('10'));

      await strategy.connect(manager).withdrawToVault(parseUnits('30'));

      expect(await yVault.balanceOf(strategy.address)).to.eq(parseUnits('80'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('0'),
      );
      expect(await underlying.balanceOf(vault.address)).to.eq(parseUnits('30'));
    });

    it.skip('emits an event', async () => {
      await depositToVault(parseUnits('100'));
      await vault.connect(admin).updateInvested();

      const amountToWithdraw = parseUnits('30');

      let tx = await strategy
        .connect(manager)
        .withdrawToVault(amountToWithdraw);

      await expect(tx)
        .to.emit(strategy, 'StrategyWithdrawn')
        .withArgs(amountToWithdraw);
    });

    it.skip('fails if the requested funds from the yVault are greater than available', async () => {
      await depositToVault(parseUnits('100'));
      await vault.connect(admin).updateInvested();

      const amountToWithdraw = parseUnits('101');

      await expect(
        strategy.connect(manager).withdrawToVault(amountToWithdraw),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });
  });

  const depositToVault = async (amount: BigNumber) => {
    await vault.connect(admin).deposit(
      depositParams.build({
        amount,
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(admin.address).build()],
      }),
    );
  };
});
