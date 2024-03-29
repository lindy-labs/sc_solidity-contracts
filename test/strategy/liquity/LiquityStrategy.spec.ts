import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockStabilityPool,
  LiquityStrategy,
  MockERC20,
  LiquityStrategy__factory,
  MockCurveExchange,
  Mock0x,
  ERC20,
} from '../../../typechain';

import { generateNewAddress, getETHBalance } from '../../shared/';
import { depositParams, claimParams } from '../../shared/factories';
import { setBalance } from '../../shared/forkHelpers';
import createVaultHelpers from '../../shared/vault';

const { parseUnits } = ethers.utils;

describe('LiquityStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let manager: SignerWithAddress;
  let keeper: SignerWithAddress;
  let vault: Vault;
  let stabilityPool: MockStabilityPool;
  let strategy: LiquityStrategy;
  let curveExchange: MockCurveExchange;
  let mock0x: Mock0x;
  let underlying: MockERC20;
  let lqty: MockERC20;

  let LiquityStrategyFactory: LiquityStrategy__factory;

  let addUnderlyingBalance: (
    account: SignerWithAddress,
    amount: string | BigNumber,
  ) => Promise<void>;

  let addYieldToVault: (amount: string | BigNumber) => Promise<BigNumber>;

  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = BigNumber.from(time.duration.weeks(2).toNumber());
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));
  const KEEPER_ROLE = utils.keccak256(utils.toUtf8Bytes('KEEPER_ROLE'));
  const SETTINGS_ROLE = utils.keccak256(utils.toUtf8Bytes('SETTINGS_ROLE'));

  // address of the '0x' contract performing the token swap
  const SWAP_TARGET = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';

  beforeEach(async () => {
    [admin, alice, bob, manager, keeper] = await ethers.getSigners();

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
      0,
    );

    const CurveExchange = await ethers.getContractFactory('MockCurveExchange');

    curveExchange = await CurveExchange.deploy();

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
        0,
        curveExchange.address,
      ],
      {
        kind: 'uups',
      },
    );

    await strategyProxy.deployed();

    strategy = LiquityStrategyFactory.attach(strategyProxy.address);

    await strategy.connect(admin).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);

    const Mock0x = await ethers.getContractFactory('Mock0x');
    mock0x = await Mock0x.deploy();

    await strategy.allowSwapTarget(mock0x.address);

    await underlying
      .connect(admin)
      .approve(vault.address, constants.MaxUint256);

    ({ addUnderlyingBalance, addYieldToVault } = createVaultHelpers({
      vault,
      underlying,
    }));
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
            0,
            curveExchange.address,
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
            0,
            curveExchange.address,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyStabilityPoolCannotBe0Address');
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
            0,
            curveExchange.address,
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
            0,
            curveExchange.address,
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
            0,
            curveExchange.address,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyKeeperCannotBe0Address');
    });

    it('reverts if curveExchange is address(0)', async () => {
      await expect(
        upgrades.deployProxy(
          LiquityStrategyFactory,
          [
            vault.address,
            admin.address,
            stabilityPool.address,
            lqty.address,
            underlying.address,
            keeper.address,
            0,
            constants.AddressZero,
          ],
          {
            kind: 'uups',
          },
        ),
      ).to.be.revertedWith('StrategyCurveExchangeCannotBe0Address');
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
            0,
            curveExchange.address,
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
      expect(await strategy.curveExchange()).to.eq(curveExchange.address);

      // functions
      expect(await strategy.hasAssets()).to.be.false;
      expect(
        await underlying.allowance(strategy.address, stabilityPool.address),
      ).to.eq(constants.MaxUint256);
    });
  });

  describe('#setMinProtectedAssetsPct', () => {
    it('changes the percentage of principal to protect', async () => {
      await strategy.setMinProtectedAssetsPct(5000);

      expect(await strategy.minProtectedAssetsPct()).to.eq(5000);
    });

    it('allows for percentages above 0', async () => {
      await strategy.setMinProtectedAssetsPct(12000);

      expect(await strategy.minProtectedAssetsPct()).to.eq(12000);
    });

    it('allows for a percentage of 0', async () => {
      await strategy.setMinProtectedAssetsPct(0);

      expect(await strategy.minProtectedAssetsPct()).to.eq(0);
    });

    it('reverts if caller is not settings', async () => {
      await expect(
        strategy.connect(manager).setMinProtectedAssetsPct(5000),
      ).to.be.revertedWith('StrategyCallerNotSettings');
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
      await depositToVault(admin, underlyingAmount);

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
      await depositToVault(admin, underlyingAmount);
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
      await depositToVault(admin, parseUnits('100'));
      await vault.connect(admin).updateInvested();

      const amountToWithdraw = parseUnits('101');

      await expect(
        strategy.connect(manager).withdrawToVault(amountToWithdraw),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('works when amount is less than invested assets', async () => {
      await depositToVault(admin, parseUnits('100'));
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
      await depositToVault(admin, depositAmount);
      await vault.connect(admin).updateInvested();

      await strategy.connect(manager).withdrawToVault(depositAmount);

      expect(await stabilityPool.balances(strategy.address)).to.eq('0');
      expect(await strategy.investedAssets()).to.eq('0');
      expect(await underlying.balanceOf(vault.address)).to.eq(depositAmount);
    });

    it('emits StrategyWithdrawn event', async () => {
      await depositToVault(admin, parseUnits('100'));
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
        strategy.connect(admin).reinvest(swapTarget, 0, [], 0, [], 0),
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
        strategy.connect(alice).reinvest(SWAP_TARGET, 0, [], 0, [], 0),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('revert if swapTarget is 0 address', async () => {
      await expect(
        strategy
          .connect(keeper)
          .reinvest(constants.AddressZero, 0, [], 0, [], 0),
      ).to.be.revertedWith('StrategySwapTargetCannotBe0Address');
    });

    it('reverts if eth & lqty rewards balance is zero', async () => {
      await strategy.connect(admin).allowSwapTarget(SWAP_TARGET);

      await expect(
        strategy.connect(keeper).reinvest(SWAP_TARGET, 0, [], 0, [], 0),
      ).to.be.revertedWith('StrategyNothingToReinvest');
    });

    it('protects principal by reverting when the reinvested amount is not enough to cover the principal', async () => {
      const depositAmount = parseUnits('10000');
      const protectedPct = '10500'; // 105%
      const protectedAmount = depositAmount.mul(protectedPct).div(10000);
      await strategy.setMinProtectedAssetsPct(protectedPct);

      // deposit
      await addUnderlyingBalance(alice, depositAmount);
      await depositToVault(alice, depositAmount);

      await vault.setInvestPct('9000'); // 90%
      await vault.updateInvested();

      // burn lusd and add eth reward
      await stabilityPool.reduceDepositorLUSDBalance(
        strategy.address,
        parseUnits('5000'),
      );
      const ethAmount = parseUnits('6000');
      await setBalance(strategy.address, ethAmount);

      expect(await vault.totalUnderlying()).to.gt(protectedAmount);
      expect(await vault.totalUnderlying()).to.eq(parseUnits('11000'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('10000'));

      // deposited = 10000
      // vault underlying = 1000
      // lusd invested = 4000
      // eth reward = 6000
      // strategy invested assets = 10000
      // protected amount = 10000 * 105% = 10500
      // => amountOutMin has to be at least 10500 - 1000 - 4000 = 5500
      const insufficientAmountOutMin = parseUnits('5499');

      await expect(
        strategy
          .connect(keeper)
          .reinvest(
            mock0x.address,
            0,
            [],
            ethAmount,
            [],
            insufficientAmountOutMin,
          ),
      ).to.be.revertedWith('StrategyMinimumAssetsProtection');
    });

    it('protects principal + the sponsored amount', async () => {
      const depositAmount = parseUnits('5000');
      const sponsorAmount = parseUnits('5000');
      const protectedPct = '10500'; // 105%
      const protectedAmount = depositAmount
        .add(sponsorAmount)
        .mul(protectedPct)
        .div(10000);
      await strategy.setMinProtectedAssetsPct(protectedPct);

      // deposit
      await addUnderlyingBalance(alice, depositAmount);
      await depositToVault(alice, depositAmount);

      // sponsor
      await addUnderlyingBalance(admin, sponsorAmount);
      await vault.sponsor(
        underlying.address,
        sponsorAmount,
        MIN_LOCK_PERIOD,
        '99000',
      );

      await vault.setInvestPct('9000'); // 90%
      await vault.updateInvested();

      // burn lusd and add eth reward
      await stabilityPool.reduceDepositorLUSDBalance(
        strategy.address,
        parseUnits('5000'),
      );
      const ethAmount = parseUnits('6000');
      await setBalance(strategy.address, ethAmount);

      expect(await vault.totalUnderlying()).to.gt(protectedAmount);
      expect(await vault.totalUnderlying()).to.eq(parseUnits('11000'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('10000'));

      // deposited = 10000 (5000 + 5000)
      // vault underlying = 1000
      // lusd invested = 4000
      // eth reward = 6000
      // strategy invested assets = 10000
      // protected amount = (5000 + 5000) * 105% = 10500
      // => amountOutMin has to be at least 10500 - 1000 - 4000 = 5500
      const insufficientAmountOutMin = parseUnits('5499');

      await expect(
        strategy
          .connect(keeper)
          .reinvest(
            mock0x.address,
            0,
            [],
            ethAmount,
            [],
            insufficientAmountOutMin,
          ),
      ).to.be.revertedWith('StrategyMinimumAssetsProtection');
    });

    it('protects principal + sponsored amount + accumulated perf fee', async () => {
      const depositAmount = parseUnits('5000');
      const sponsorAmount = parseUnits('5000');
      const performanceFee = parseUnits('1000');
      const protectedPct = '10500'; // 105%
      const protectedAmount = depositAmount
        .add(sponsorAmount)
        .add(performanceFee)
        .mul(protectedPct)
        .div(10000);
      await strategy.setMinProtectedAssetsPct(protectedPct);

      // deposit
      await addUnderlyingBalance(alice, depositAmount);
      await depositToVault(alice, depositAmount);

      // sponsor
      await addUnderlyingBalance(admin, sponsorAmount);
      await vault.sponsor(
        underlying.address,
        sponsorAmount,
        MIN_LOCK_PERIOD,
        '99000',
      );

      await vault.setInvestPct('9000'); // 90%
      await vault.updateInvested();

      // add performance fee
      await vault.setPerfFeePct('5000'); // 50%
      await addYieldToVault(performanceFee.mul(2));
      await vault.connect(alice).claimYield(alice.address);

      expect(await vault.accumulatedPerfFee()).to.eq(performanceFee.sub(1)); // sub 1 wei to avoid rounding errors

      // burn lusd and add eth reward
      await stabilityPool.reduceDepositorLUSDBalance(
        strategy.address,
        parseUnits('5000'),
      );
      const ethAmount = parseUnits('6000');
      await setBalance(strategy.address, ethAmount);

      expect(await vault.totalUnderlying()).to.gt(protectedAmount);
      expect(await vault.totalUnderlying()).to.eq(parseUnits('12000'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('10000'));

      // deposited = 10000
      // vault underlying = 1000 + 1000 (perf fee)
      // lusd invested = 4000
      // eth reward = 6000
      // strategy invested assets = 10000
      // protected amount = (10000 + 1000)* 105% = 11550
      // => amountOutMin has to be at least 11150 - 2000 - 4000 = 5150
      const insufficientAmountOutMin = parseUnits('5149');

      await expect(
        strategy
          .connect(keeper)
          .reinvest(
            mock0x.address,
            0,
            [],
            ethAmount,
            [],
            insufficientAmountOutMin,
          ),
      ).to.be.revertedWith('StrategyMinimumAssetsProtection');
    });

    it('bypasses min assets protection when total underlying assets are less than principal', async () => {
      const depositAmount = parseUnits('10000');
      const protectedPct = '11500'; // 115%
      const protectedAmount = depositAmount.mul(protectedPct).div(10000);
      await strategy.setMinProtectedAssetsPct(protectedPct);

      // deposit
      await addUnderlyingBalance(alice, depositAmount);
      await depositToVault(alice, depositAmount);

      // sposnor
      await vault.setInvestPct('9000'); // 90%
      await vault.updateInvested();

      // burn lusd and add eth reward
      await stabilityPool.reduceDepositorLUSDBalance(
        strategy.address,
        parseUnits('5000'),
      );
      const ethAmount = parseUnits('6000');
      await setBalance(strategy.address, ethAmount);
      const ethSwapData = getSwapData(
        constants.AddressZero,
        underlying,
        ethAmount,
      );

      expect(await vault.totalUnderlying()).to.lt(protectedAmount);
      expect(await vault.totalUnderlying()).to.eq(parseUnits('11000'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('10000'));

      // deposited = 10000
      // vault underlying = 1000
      // lusd invested = 4000
      // eth reward = 6000
      // strategy invested assets = 10000
      // min protected amount = 10000 * 115% = 11500
      // => amountOutMin has to be at least 11500 - 1000 - 4000 = 6500
      const insufficientAmountOutMin = parseUnits('6000');

      await strategy
        .connect(keeper)
        .reinvest(
          mock0x.address,
          0,
          [],
          ethAmount,
          ethSwapData,
          insufficientAmountOutMin,
        );

      expect(await underlying.balanceOf(strategy.address)).to.eq('0');
      expect(await getETHBalance(strategy.address)).to.eq('0');
    });

    it('bypasses min assets protection when total underlying assets are less than principal + sponsored amount + perf fee', async () => {
      const depositAmount = parseUnits('5000');
      const sponsorAmount = parseUnits('5000');
      const performanceFee = parseUnits('1000');
      const protectedPct = '11500'; // 115%
      const protectedAmount = depositAmount
        .add(sponsorAmount)
        .add(performanceFee)
        .mul(protectedPct)
        .div(10000);
      await strategy.setMinProtectedAssetsPct(protectedPct);

      // deposit
      await addUnderlyingBalance(alice, depositAmount);
      await depositToVault(alice, depositAmount);

      // sponsor
      await addUnderlyingBalance(admin, sponsorAmount);
      await vault.sponsor(
        underlying.address,
        sponsorAmount,
        MIN_LOCK_PERIOD,
        '99000',
      );

      await vault.setInvestPct('9000'); // 90%
      await vault.updateInvested();

      // add performance fee
      await vault.setPerfFeePct('5000'); // 50%
      await addYieldToVault(performanceFee.mul(2));
      await vault.connect(alice).claimYield(alice.address);
      expect(await vault.accumulatedPerfFee()).to.eq(performanceFee.sub(1)); // sub 1 wei to avoid rounding errors

      // burn lusd and add eth reward
      await stabilityPool.reduceDepositorLUSDBalance(
        strategy.address,
        parseUnits('5000'),
      );
      const ethAmount = parseUnits('6500');
      await setBalance(strategy.address, ethAmount);
      const ethSwapData = getSwapData(
        constants.AddressZero,
        underlying,
        ethAmount,
      );

      expect(await vault.totalUnderlying()).to.lt(protectedAmount);
      expect(await vault.totalUnderlying()).to.eq(parseUnits('12500'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('10500'));

      // deposited = 10000
      // vault underlying = 1000 + 1000 (perf fee)
      // lusd invested = 4000
      // eth reward = 6000
      // strategy invested assets = 10000
      // protected amount = (10000 + 1000)* 115% = 12650
      // => amountOutMin has to be at least 12650 - 2000 - 4000 = 6650
      const insufficientAmountOutMin = parseUnits('6500');

      await strategy
        .connect(keeper)
        .reinvest(
          mock0x.address,
          0,
          [],
          ethAmount,
          ethSwapData,
          insufficientAmountOutMin,
        );

      expect(await underlying.balanceOf(strategy.address)).to.eq('0');
      expect(await getETHBalance(strategy.address)).to.eq('0');
    });

    it('works if LQTY + ETH amount sold is enough to cover min protected assets amount', async () => {
      await vault.setInvestPct('5000'); // 50%
      await strategy.setMinProtectedAssetsPct('11000'); // 110%
      await addUnderlyingBalance(alice, '20000');

      const params = depositParams.build({
        amount: parseUnits('20000'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await vault.updateInvested();
      expect(await strategy.investedAssets()).to.eq(parseUnits('10000'));

      const lqtyAmount = parseUnits('1300');
      await lqty.mint(strategy.address, lqtyAmount);
      const lqtySwapData = getSwapData(lqty, underlying, lqtyAmount);

      const ethAmount = parseUnits('800');
      await setBalance(strategy.address, ethAmount);

      const ethAmountToReinvest = parseUnits('700');
      const ethSwapData = getSwapData(
        constants.AddressZero,
        underlying,
        ethAmountToReinvest,
      );

      // need to reinvest min 2000
      await strategy.connect(keeper).reinvest(
        mock0x.address,
        lqtyAmount,
        lqtySwapData,
        ethAmountToReinvest,
        ethSwapData,
        parseUnits('2000'), // amountOutMin
      );

      expect(await underlying.balanceOf(strategy.address)).to.eq('0');
      expect(await lqty.balanceOf(strategy.address)).to.eq('0');
      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('100'));
      expect(
        await stabilityPool.getCompoundedLUSDDeposit(strategy.address),
      ).to.be.eq(parseUnits('12000'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('12100'));
    });

    it('fails if LQTY + ETH amount sold is not enough to cover protected assets amount', async () => {
      await vault.setInvestPct('9000'); // 90%
      await strategy.setMinProtectedAssetsPct('12000'); // 120%
      await addUnderlyingBalance(alice, '10000');

      const params = depositParams.build({
        amount: parseUnits('10000'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await vault.updateInvested(); // 9000 invested
      expect(await strategy.investedAssets()).to.eq(parseUnits('9000'));

      const lqtyAmount = parseUnits('1000');
      await lqty.mint(strategy.address, lqtyAmount);
      const lqtySwapData = getSwapData(lqty, underlying, lqtyAmount);

      const ethAmount = parseUnits('2000');
      await setBalance(strategy.address, ethAmount);
      const ethSwapData = getSwapData(
        constants.AddressZero,
        underlying,
        ethAmount,
      );

      // need to reinvest min 2000 to cover the principal
      await expect(
        strategy.connect(keeper).reinvest(
          mock0x.address,
          lqtyAmount,
          lqtySwapData,
          ethAmount,
          ethSwapData,
          parseUnits('1999'), // amountOutMin
        ),
      ).to.be.revertedWith('StrategyMinimumAssetsProtection');
    });

    it('works when selling and reinvesting all of LQTY and ETH', async () => {
      await underlying.mint(strategy.address, parseUnits('10000'));
      await strategy.connect(manager).invest();

      const lqtyAmount = parseUnits('500');
      await lqty.mint(strategy.address, lqtyAmount);
      await setLqtyToUnderlyingExchageRate(parseUnits('2'));
      const lqtySwapData = getSwapData(lqty, underlying, lqtyAmount);

      const ethAmount = parseUnits('1');
      await setBalance(strategy.address, ethAmount);
      await setEthToUnderlyingExchageRate(parseUnits('1000'));
      const ethSwapData = getSwapData(
        constants.AddressZero,
        underlying,
        ethAmount,
      );

      await strategy.connect(keeper).reinvest(
        mock0x.address,
        lqtyAmount,
        lqtySwapData,
        ethAmount,
        ethSwapData,
        parseUnits('2000'), // 500LQTY * 2 + 1ETH * 1000
      );

      // assert no funds remain held by the strategy
      expect(await underlying.balanceOf(strategy.address)).to.eq('0');
      expect(await lqty.balanceOf(strategy.address)).to.eq('0');
      expect(await getETHBalance(strategy.address)).to.eq('0');

      expect(await strategy.investedAssets()).to.eq(parseUnits('12000'));
    });
  });

  describe('#transferYield', () => {
    it('has no effect on ETH and underlying balances', async () => {
      setBalance(strategy.address, parseUnits('100'));
      await underlying.mint(strategy.address, parseUnits('200'));

      await expect(
        strategy
          .connect(manager)
          .transferYield(alice.address, parseUnits('100')),
      ).not.to.be.reverted;

      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('100'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('200'),
      );
    });
  });

  async function depositToVault(
    user: SignerWithAddress,
    amount: BigNumber | string,
  ) {
    await vault.connect(user).deposit(
      depositParams.build({
        amount: amount instanceof BigNumber ? amount : parseUnits(amount),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(user.address).build()],
      }),
    );
  }

  function getSwapData(
    from: ERC20 | string,
    to: ERC20 | string,
    amount: BigNumber | string,
  ) {
    const fromAddress = typeof from === 'string' ? from : from.address;
    const toAddress = typeof to === 'string' ? to : to.address;

    return ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint256'],
      [fromAddress, toAddress, amount],
    );
  }

  async function setEthToUnderlyingExchageRate(
    exchangeRate: BigNumber | string,
  ) {
    await mock0x.setExchageRate(
      constants.AddressZero,
      underlying.address,
      exchangeRate,
    );
    await curveExchange.setExchageRate(
      constants.AddressZero,
      underlying.address,
      exchangeRate,
    );
  }

  async function setLqtyToUnderlyingExchageRate(
    exchangeRate: BigNumber | string,
  ) {
    await mock0x.setExchageRate(lqty.address, underlying.address, exchangeRate);
    await curveExchange.setExchageRate(
      lqty.address,
      underlying.address,
      exchangeRate,
    );
  }
});
