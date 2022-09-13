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

const { parseUnits } = ethers.utils;

describe('LiquityStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let keeper: SignerWithAddress;
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
  const KEEPER_ROLE = utils.keccak256(utils.toUtf8Bytes('KEEPER_ROLE'));
  const SETTINGS_ROLE = utils.keccak256(utils.toUtf8Bytes('SETTINGS_ROLE'));

  // address of the '0x' contract performing the token swap
  const SWAP_TARGET = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';

  beforeEach(async () => {
    [admin, alice, manager, keeper] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    underlying = await MockERC20.deploy(
      'LUSD',
      'LUSD',
      18,
      parseUnits('1000000000'),
    );

    lqty = await MockERC20.deploy('LQTY', 'LQTY', 18, parseUnits('1000000000'));

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

    const strategyProxy = await upgrades.deployProxy(
      LiquityStrategyFactory,
      [
        vault.address,
        admin.address,
        stabilityPool.address,
        lqty.address,
        underlying.address,
        keeper.address,
      ],
      {
        kind: 'uups',
      },
    );

    await strategyProxy.deployed();

    strategy = LiquityStrategyFactory.attach(strategyProxy.address);

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
            keeper.address,
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
            keeper.address,
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
            keeper.address,
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
            keeper.address,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it('reverts if keeper is address(0)', async () => {
      await expect(
        upgrades.deployProxy(
          LiquityStrategyFactory,
          [
            vault.address,
            admin.address,
            stabilityPool.address,
            lqty.address,
            underlying.address,
            constants.AddressZero,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyKeeperCannotBe0Address');
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
            keeper.address,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyNotIVault');
    });

    it('checks initial values', async () => {
      // access control
      expect(await strategy.isSync()).to.be.true;
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await strategy.hasRole(KEEPER_ROLE, admin.address)).to.be.true;
      expect(await strategy.hasRole(SETTINGS_ROLE, admin.address)).to.be.true;
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.true;
      expect(await strategy.hasRole(KEEPER_ROLE, keeper.address)).to.be.true;

      // state
      expect(await strategy.vault()).to.eq(vault.address);
      expect(await strategy.stabilityPool()).to.eq(stabilityPool.address);
      expect(await strategy.underlying()).to.eq(underlying.address);

      // functions
      expect(await strategy.hasAssets()).to.be.false;
      expect(
        await underlying.allowance(strategy.address, stabilityPool.address),
      ).to.eq(constants.MaxUint256);
    });
  });

  describe('#transferAdminRights', () => {
    it('reverts if caller is not admin', async () => {
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
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .false;
      expect(await strategy.hasRole(KEEPER_ROLE, alice.address)).to.be.false;
      expect(await strategy.hasRole(SETTINGS_ROLE, alice.address)).to.be.false;

      await strategy.connect(admin).transferAdminRights(alice.address);

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .true;
      expect(await strategy.hasRole(KEEPER_ROLE, alice.address)).to.be.true;
      expect(await strategy.hasRole(SETTINGS_ROLE, alice.address)).to.be.true;
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .false;
      expect(await strategy.hasRole(KEEPER_ROLE, admin.address)).to.be.false;
      expect(await strategy.hasRole(SETTINGS_ROLE, admin.address)).to.be.false;
    });
  });

  describe('#invest', () => {
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
      let underlyingAmount = utils.parseUnits('100');
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
      let underlyingAmount = utils.parseUnits('100');
      await depositToVault(underlyingAmount);
      const tx = await vault.connect(admin).updateInvested();
      await expect(tx)
        .to.emit(strategy, 'StrategyInvested')
        .withArgs(underlyingAmount);
    });
  });

  describe('#withdrawToVault', () => {
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

    it('reverts if amount is greater than invested assets', async () => {
      await depositToVault(parseUnits('100'));
      await vault.connect(admin).updateInvested();

      const amountToWithdraw = parseUnits('101');

      await expect(
        strategy.connect(manager).withdrawToVault(amountToWithdraw),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('works when amount is less than invested assets', async () => {
      await depositToVault(parseUnits('100'));
      await vault.connect(admin).updateInvested();

      const amountToWithdraw = parseUnits('30');

      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      expect(await stabilityPool.balances(strategy.address)).to.eq(
        parseUnits('70'),
      );
      expect(await strategy.investedAssets()).to.eq(parseUnits('70'));
      expect(await underlying.balanceOf(vault.address)).to.eq(parseUnits('30'));
    });

    it('works when amount is equal to invested assets', async () => {
      const depositAmount = parseUnits('100');
      await depositToVault(depositAmount);
      await vault.connect(admin).updateInvested();

      await strategy.connect(manager).withdrawToVault(depositAmount);

      expect(await stabilityPool.balances(strategy.address)).to.eq('0');
      expect(await strategy.investedAssets()).to.eq('0');
      expect(await underlying.balanceOf(vault.address)).to.eq(depositAmount);
    });

    it('emits StrategyWithdrawn event', async () => {
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
  });

  describe('#allowSwapTarget', () => {
    it('fails if caller is not settings', async () => {
      await expect(
        strategy.connect(alice).allowSwapTarget(SWAP_TARGET),
      ).to.be.revertedWith('StrategyCallerNotSettings');
    });

    it('fails if swap target is address(0)', async () => {
      await expect(
        strategy.connect(admin).allowSwapTarget(constants.AddressZero),
      ).to.be.revertedWith('StrategySwapTargetCannotBe0Address');
    });

    it('adds an address to allowed swap targets', async () => {
      const swapTarget = alice.address;
      await strategy.connect(admin).allowSwapTarget(swapTarget);

      expect(await strategy.allowedSwapTargets(swapTarget)).to.be.true;
    });

    it('fails if swap target is not allowed', async () => {
      const swapTarget = alice.address;

      await expect(
        strategy.connect(admin).reinvest(swapTarget, 0, [], 0, []),
      ).to.be.revertedWith('StrategySwapTargetNotAllowed');
    });
  });

  describe('#denySwapTarget', () => {
    it('fails if caller is not settings', async () => {
      await expect(
        strategy.connect(alice).denySwapTarget(SWAP_TARGET),
      ).to.be.revertedWith('StrategyCallerNotSettings');
    });

    it('fails if swap target is address(0)', async () => {
      await expect(
        strategy.connect(admin).denySwapTarget(constants.AddressZero),
      ).to.be.revertedWith('StrategySwapTargetCannotBe0Address');
    });

    it('removes an address from allowed swap targets', async () => {
      await strategy.connect(admin).allowSwapTarget(SWAP_TARGET);

      await strategy.connect(admin).denySwapTarget(SWAP_TARGET);

      expect(await strategy.allowedSwapTargets(SWAP_TARGET)).to.be.false;
    });
  });

  describe('#reinvest', () => {
    it('reverts if msg.sender is not keeper', async () => {
      await expect(
        strategy.connect(alice).reinvest(SWAP_TARGET, 0, [], 0, []),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('revert if swapTarget is 0 address', async () => {
      await expect(
        strategy.connect(keeper).reinvest(constants.AddressZero, 0, [], 0, []),
      ).to.be.revertedWith('StrategySwapTargetCannotBe0Address');
    });

    it('reverts if eth & lqty rewards balance is zero', async () => {
      await strategy.connect(admin).allowSwapTarget(SWAP_TARGET);

      await expect(
        strategy.connect(keeper).reinvest(SWAP_TARGET, 0, [], 0, []),
      ).to.be.revertedWith('StrategyNothingToReinvest');
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
