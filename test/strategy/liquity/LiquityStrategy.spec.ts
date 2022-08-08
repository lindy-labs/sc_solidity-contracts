import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockStabilityPool,
  LiquityStrategy,
  MockERC20,
  LiquityStrategy__factory,
} from '../../../typechain';

import { generateNewAddress } from '../../shared/';
import { depositParams, claimParams } from '../../shared/factories';

const { parseEther } = utils;

describe('LiquityStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let stabilityPool: MockStabilityPool;
  let strategy: LiquityStrategy;
  let underlying: MockERC20;
  let lqty: MockERC20;

  let LiquityStrategyFactory: LiquityStrategy__factory;

  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = 1;
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');
  const INVESTMENT_FEE_PCT = BigNumber.from('0');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    [admin, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    underlying = await MockERC20.deploy(
      'LUSD',
      'LUSD',
      18,
      parseEther('1000000000'),
    );

    lqty = await MockERC20.deploy('LQTY', 'LQTY', 18, parseEther('1000000000'));

    const StabilityPoolFactory = await ethers.getContractFactory(
      'MockStabilityPool',
    );

    stabilityPool = await StabilityPoolFactory.deploy(underlying.address);

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

    const strategy_proxy = await upgrades.deployProxy(
      LiquityStrategyFactory,
      [
        vault.address,
        admin.address,
        stabilityPool.address,
        lqty.address,
        underlying.address,
      ],
      {
        kind: 'uups',
      },
    );

    await strategy_proxy.deployed();

    strategy = LiquityStrategyFactory.attach(strategy_proxy.address);

    await strategy.connect(admin).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);

    await underlying
      .connect(admin)
      .approve(vault.address, constants.MaxUint256);
  });

  describe('#initialize', () => {
    it('reverts if admin is address(0)', async () => {
      await expect(
        upgrades.deployProxy(
          LiquityStrategyFactory,
          [
            vault.address,
            constants.AddressZero,
            stabilityPool.address,
            lqty.address,
            underlying.address,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyAdminCannotBe0Address');
    });

    it('reverts if stabilityPool is address(0)', async () => {
      await expect(
        upgrades.deployProxy(
          LiquityStrategyFactory,
          [
            vault.address,
            admin.address,
            constants.AddressZero,
            lqty.address,
            underlying.address,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyStabilityPoolCannotBeAddressZero');
    });

    it('reverts if lqty is address(0)', async () => {
      await expect(
        upgrades.deployProxy(
          LiquityStrategyFactory,
          [
            vault.address,
            admin.address,
            stabilityPool.address,
            constants.AddressZero,
            underlying.address,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyYieldTokenCannotBe0Address');
    });

    it('reverts if underlying is address(0)', async () => {
      await expect(
        upgrades.deployProxy(
          LiquityStrategyFactory,
          [
            vault.address,
            admin.address,
            stabilityPool.address,
            lqty.address,
            constants.AddressZero,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it('reverts if vault does not have IVault interface', async () => {
      await expect(
        upgrades.deployProxy(
          LiquityStrategyFactory,
          [
            manager.address,
            admin.address,
            stabilityPool.address,
            lqty.address,
            underlying.address,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyNotIVault');
    });

    it('checks initial values', async () => {
      expect(await strategy.isSync()).to.be.true;
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.true;
      expect(await strategy.vault()).to.eq(vault.address);
      expect(await strategy.stabilityPool()).to.eq(stabilityPool.address);

      expect(await strategy.underlying()).to.eq(underlying.address);

      expect(await strategy.hasAssets()).to.be.false;
      expect(
        await underlying.allowance(strategy.address, stabilityPool.address),
      ).to.eq(constants.MaxUint256);
    });
  });

  describe('#transferAdminRights', () => {
    it('can only be called by the current admin', async () => {
      await expect(
        strategy.connect(alice).transferAdminRights(alice.address),
      ).to.be.revertedWith('StrategyCallerNotAdmin');
    });

    it('reverts if new admin is address(0)', async () => {
      await expect(
        strategy.connect(admin).transferAdminRights(constants.AddressZero),
      ).to.be.revertedWith('StrategyAdminCannotBe0Address');
    });

    it('reverts if the new admin is the same as the current one', async () => {
      await expect(
        strategy.connect(admin).transferAdminRights(admin.address),
      ).to.be.revertedWith('StrategyCannotTransferAdminRightsToSelf');
    });

    it('transfers admin role to the new admin account', async () => {
      expect(
        await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address),
      ).to.be.equal(false);

      await strategy.connect(admin).transferAdminRights(alice.address);

      expect(
        await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address),
      ).to.be.equal(true);
    });

    it("revokes previous owner's ADMIN role and sets up ADMIN role for the new owner", async () => {
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;

      await strategy.connect(admin).transferAdminRights(alice.address);

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .false;

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .true;
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

    it('deposits underlying to the stabilityPool', async () => {
      let underlyingAmount = utils.parseEther('100');
      await depositToVault(underlyingAmount);

      expect(await vault.totalUnderlying()).to.eq(underlyingAmount);
      expect(await strategy.investedAssets()).to.eq(0);
      expect(await strategy.hasAssets()).be.false;

      await vault.connect(admin).updateInvested();

      expect(await underlying.balanceOf(stabilityPool.address)).to.eq(
        underlyingAmount,
      );
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await strategy.investedAssets()).to.eq(underlyingAmount);
      expect(await strategy.hasAssets()).be.true;
      expect(await vault.totalUnderlying()).to.eq(underlyingAmount);
    });

    it('emits a StrategyInvested event', async () => {
      let underlyingAmount = utils.parseEther('100');
      await depositToVault(underlyingAmount);
      const tx = await vault.connect(admin).updateInvested();
      await expect(tx)
        .to.emit(strategy, 'StrategyInvested')
        .withArgs(underlyingAmount);
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

    it('removes the requested funds from the stabilityPool', async () => {
      await depositToVault(parseEther('100'));
      await vault.connect(admin).updateInvested();

      const amountToWithdraw = parseEther('30');

      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      expect(await stabilityPool.balances(strategy.address)).to.eq(
        parseEther('70'),
      );
      expect(await strategy.investedAssets()).to.eq(parseEther('70'));
    });

    it('emits an event', async () => {
      await depositToVault(parseEther('100'));
      await vault.connect(admin).updateInvested();

      const amountToWithdraw = parseEther('30');

      let tx = await strategy
        .connect(manager)
        .withdrawToVault(amountToWithdraw);

      await expect(tx)
        .to.emit(strategy, 'StrategyWithdrawn')
        .withArgs(amountToWithdraw);
    });

    it('fails if the requested funds from the stabilityPool are greater than available', async () => {
      await depositToVault(parseEther('100'));
      await vault.connect(admin).updateInvested();

      const amountToWithdraw = parseEther('101');

      await expect(
        strategy.connect(manager).withdrawToVault(amountToWithdraw),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });
  });

  // describe('#harvest functionality', () => {});

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

// TODO:
// add tests for the upgradeable & initialiable part of the contract
// add tests for the harvest method
// update fork tests to be compatible with the upgradeable Liquity Strategy contract
