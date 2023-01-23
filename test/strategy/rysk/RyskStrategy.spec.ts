import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';
import { time } from '@openzeppelin/test-helpers';

import {
  Vault,
  MockRyskLiquidityPool,
  RyskStrategy,
  RyskStrategy__factory,
  MockUSDC,
} from '../../../typechain';

import {
  generateNewAddress,
  ForkHelpers,
  parseUSDC,
  moveForwardTwoWeeks,
  getLastBlockTimestamp,
  increaseTime,
} from '../../shared/';
import { parseUnits } from 'ethers/lib/utils';

describe('RyskStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let keeper: SignerWithAddress;
  let vault: Vault;
  let ryskLqPool: MockRyskLiquidityPool;
  let strategy: RyskStrategy;
  let underlying: MockUSDC;

  let RyskStrategyFactory: RyskStrategy__factory;

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const SETTINGS_ROLE = utils.keccak256(utils.toUtf8Bytes('SETTINGS_ROLE'));
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  const YIELD_CYCLE_DURATION = time.duration.days(10).toString();

  beforeEach(async () => {
    [admin, alice, manager, keeper] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockUSDC');
    underlying = await MockERC20.deploy(parseUSDC('1000000'));

    const RyskLqPoolFactory = await ethers.getContractFactory(
      'MockRyskLiquidityPool',
    );

    ryskLqPool = await RyskLqPoolFactory.deploy(
      'Rysk Liquidity Pool',
      'ryskShares',
      underlying.address,
    );

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      underlying.address,
      1, // MIN_LOCK_PERIOD
      BigNumber.from('10000'), // INVEST_PCT
      generateNewAddress(), // TREASURY
      admin.address,
      BigNumber.from('0'), // PERFORMANCE_FEE_PCT
      BigNumber.from('0'), // INVESTMENT_FEE_PCT,
      [],
      0,
    );

    RyskStrategyFactory = await ethers.getContractFactory('RyskStrategy');

    strategy = await RyskStrategyFactory.deploy(
      vault.address,
      admin.address,
      keeper.address,
      ryskLqPool.address,
      underlying.address,
      YIELD_CYCLE_DURATION,
    );

    await strategy.connect(admin).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);

    await underlying
      .connect(admin)
      .approve(vault.address, constants.MaxUint256);
  });

  describe('#constructor', () => {
    it('reverts if the admin is address(0)', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          vault.address,
          constants.AddressZero,
          keeper.address,
          ryskLqPool.address,
          underlying.address,
          YIELD_CYCLE_DURATION,
        ),
      ).to.be.revertedWith('StrategyAdminCannotBe0Address');
    });

    it('reverts if the keeper is address(0)', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          vault.address,
          admin.address,
          constants.AddressZero,
          ryskLqPool.address,
          underlying.address,
          YIELD_CYCLE_DURATION,
        ),
      ).to.be.revertedWith('StrategyKeeperCannotBe0Address');
    });

    it('reverts if the Rysk liquidity pool is address(0)', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          constants.AddressZero,
          underlying.address,
          YIELD_CYCLE_DURATION,
        ),
      ).to.be.revertedWith('RyskLiquidityPoolCannotBe0Address');
    });

    it('reverts if underlying is address(0)', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          ryskLqPool.address,
          constants.AddressZero,
          YIELD_CYCLE_DURATION,
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it('reverts if vault does not have IVault interface', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          manager.address, // vault param
          admin.address,
          keeper.address,
          ryskLqPool.address,
          underlying.address,
          YIELD_CYCLE_DURATION,
        ),
      ).to.be.revertedWith('StrategyNotIVault');
    });

    it('reverts if yield cycle duration is greater than max duration', async () => {
      const invalidCycleDuration = (await strategy.MAX_CYCLE_DURATION()).add(1);

      await expect(
        RyskStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          ryskLqPool.address,
          underlying.address,
          invalidCycleDuration,
        ),
      ).to.be.revertedWith('StrategyInvalidYieldDistributionCycleDuration');
    });

    it('reverts if yield cycle duration is less than min duration', async () => {
      const invalidCycleDuration = (await strategy.MIN_CYCLE_DURATION()).sub(1);

      await expect(
        RyskStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          ryskLqPool.address,
          underlying.address,
          invalidCycleDuration,
        ),
      ).to.be.revertedWith('StrategyInvalidYieldDistributionCycleDuration');
    });

    it('sets initial values as expected', async () => {
      expect(await strategy.vault()).to.eq(vault.address);
      expect(await strategy.ryskLqPool()).to.eq(ryskLqPool.address);
      expect(await strategy.underlying()).to.eq(underlying.address);
      expect(await strategy.cycleDuration()).to.eq(YIELD_CYCLE_DURATION);

      expect(await strategy.isSync()).to.be.false;

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await strategy.hasRole(SETTINGS_ROLE, admin.address)).to.be.true;
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.true;

      expect(
        await underlying.allowance(strategy.address, ryskLqPool.address),
      ).to.eq(constants.MaxUint256);
    });
  });

  describe('#invest', () => {
    it('reverts if msg.sender is not manager', async () => {
      await expect(strategy.connect(alice).invest()).to.be.revertedWith(
        'StrategyCallerNotManager',
      );
    });

    it('reverts if underlying balance of strategy = 0', async () => {
      await expect(strategy.connect(manager).invest()).to.be.revertedWith(
        'StrategyNoUnderlying',
      );
    });

    it('transfers underlying to the Rysk liquidity pool', async () => {
      const underlyingAmount = parseUSDC('100');
      await underlying.mint(strategy.address, underlyingAmount);

      await strategy.connect(manager).invest();

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await strategy.hasAssets()).be.true;
      expect(await strategy.investedAssets()).to.eq(underlyingAmount);
      expect(await underlying.balanceOf(ryskLqPool.address)).to.eq(
        underlyingAmount,
      );
    });

    it('emits StrategyInvested event', async () => {
      const underlyingAmount = parseUSDC('100');
      await underlying.mint(strategy.address, underlyingAmount);

      const tx = await strategy.connect(manager).invest();

      await expect(tx)
        .to.emit(strategy, 'StrategyInvested')
        .withArgs(underlyingAmount);
    });

    it('receives a deposit receipt', async () => {
      const underlyingAmount = parseUSDC('100');
      await underlying.mint(strategy.address, underlyingAmount);
      const epoch = await ryskLqPool.depositEpoch();
      expect(await underlying.balanceOf(ryskLqPool.address)).to.eq(0);

      await strategy.connect(manager).invest();

      const depositReceipt = await ryskLqPool.depositReceipts(strategy.address);
      expect(depositReceipt.epoch).to.eq(epoch);
      expect(depositReceipt.amount).to.eq(underlyingAmount);
      expect(depositReceipt.unredeemedShares).to.eq(0);
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

    it('initiates withdrawal from Rysk liquidity pool', async () => {
      const underlyingAmount = parseUSDC('100');
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      const amountToWithdraw = parseUSDC('100');
      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      // underlying owned by Rysk liquidity pool does not chage at this point
      expect(await underlying.balanceOf(ryskLqPool.address)).to.eq(
        underlyingAmount,
      );
      // invested assets do not chage at this point
      expect(await strategy.investedAssets()).to.eq(underlyingAmount);
      // only the withdrawal receipt is created
      const withdrawalReceipt = await ryskLqPool.withdrawalReceipts(
        strategy.address,
      );
      expect(withdrawalReceipt.epoch).to.eq(await ryskLqPool.withdrawalEpoch());
      // shares = amountToWithdraw because price per share = 1 underlying
      expect(withdrawalReceipt.shares).to.eq(parseUnits('100'));
    });

    it('emits StrategyWithdrawalInitiated event', async () => {
      const underlyingAmount = parseUSDC('100');
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      const amountToWithdraw = parseUSDC('50');

      const tx = await strategy
        .connect(manager)
        .withdrawToVault(amountToWithdraw);

      await expect(tx)
        .to.emit(strategy, 'StrategyWithdrawalInitiated')
        .withArgs(amountToWithdraw);
    });

    it('redeems all currently unredeemed shares', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(manager).withdrawToVault(parseUSDC('50'));

      // all unredeemed shares are redeemed when a withdrawal is initiated
      expect(
        (await ryskLqPool.depositReceipts(strategy.address)).unredeemedShares,
      ).to.eq(0);
    });

    it('fails when amount to withdraw > invested assets', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await addYieldToRyskLqPool(parseUSDC('50'));
      await strategy.updateYieldDistributionCycle();

      expect(await strategy.investedAssets()).to.eq(parseUSDC('100'));

      const amountTooBig = parseUSDC('101');
      await expect(
        strategy.connect(manager).withdrawToVault(amountTooBig),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('fails when called multiple times with end amount to withdraw > owned shares', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // first call
      const amountOk = parseUSDC('90');
      await strategy.connect(manager).withdrawToVault(amountOk);

      // second call
      const amountTooBig = parseUSDC('10').add('2');
      await expect(
        strategy.connect(manager).withdrawToVault(amountTooBig),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('aggregates initiated withdrawal amounts (in shares) when called multiple times in the same withdrawal epoch', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawals
      await strategy.connect(manager).withdrawToVault(parseUSDC('60'));
      await strategy.connect(manager).withdrawToVault(parseUSDC('40'));

      const pendingWithdrawal = await ryskLqPool.withdrawalReceipts(
        strategy.address,
      );
      expect(pendingWithdrawal.epoch).to.eq(await ryskLqPool.withdrawalEpoch());
      // 1e18 mocked share = 1e6 underlying
      expect(pendingWithdrawal.shares).to.eq(parseUnits('100'));
    });

    it('completes the pending withdrawal from previous withdrawal epoch', async () => {
      const underlyingAmount = parseUSDC('100');
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal
      const initialWithdrawalAmount = parseUSDC('50');
      await strategy.connect(manager).withdrawToVault(initialWithdrawalAmount);

      await ryskLqPool.executeEpochCalculation();

      // initiate another withdrawal in new epoch without completing the previous one
      const subsequentWithdrawalAmount = parseUSDC('30');

      await strategy
        .connect(manager)
        .withdrawToVault(subsequentWithdrawalAmount);

      expect(await underlying.balanceOf(vault.address)).to.eq(
        initialWithdrawalAmount,
      );
      const pendingWithdrawal = await ryskLqPool.withdrawalReceipts(
        strategy.address,
      );
      expect(pendingWithdrawal.epoch).to.eq(await ryskLqPool.withdrawalEpoch());
      // 1e18 mocked share = 1e6 underlying
      expect(pendingWithdrawal.shares).to.eq(parseUnits('30'));
    });

    it('works when called after completing previous withdrawal in the same epoch', async () => {
      const underlyingAmount = parseUSDC('100');
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(manager).withdrawToVault(parseUSDC('50'));

      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(keeper).completeWithdrawal();

      await expect(strategy.connect(manager).withdrawToVault(parseUSDC('50')))
        .to.not.be.reverted;
    });
  });

  describe('#completeWithdrawal', () => {
    it('fails if caller is not keeper', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await expect(
        strategy.connect(alice).completeWithdrawal(),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('fails if withdrawal is not initiated', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await expect(
        strategy.connect(keeper).completeWithdrawal(),
      ).to.be.revertedWith('RyskNoWithdrawalInitiated');
    });

    it('fails if epoch has not advanced', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal
      await strategy.connect(manager).withdrawToVault(parseUSDC('50'));

      await expect(
        strategy.connect(keeper).completeWithdrawal(),
      ).to.be.revertedWith('RyskCannotCompleteWithdrawalInSameEpoch');
    });

    it('works if epoch has advanced', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal
      const amountToWithdraw = parseUSDC('50');
      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      // advance epoch
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(keeper).completeWithdrawal();

      expect(await underlying.balanceOf(vault.address)).to.eq(amountToWithdraw);
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );
    });

    it('emits StrategyWithdrawn event', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal
      const amountToWithdraw = parseUSDC('50');
      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      // advance epoch
      await ryskLqPool.executeEpochCalculation();

      const tx = await strategy.connect(keeper).completeWithdrawal();

      await expect(tx)
        .to.emit(strategy, 'StrategyWithdrawn')
        .withArgs(amountToWithdraw);
    });

    it('works when yield is generated on Rysk liquidity pool', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // generate yield
      await underlying.mint(ryskLqPool.address, parseUSDC('100'));
      await ryskLqPool.executeEpochCalculation();
      await strategy.updateYieldDistributionCycle();

      // initiate withdrawal
      const epoch = await ryskLqPool.withdrawalEpoch();
      const shares = await ryskLqPool.totalSupply();
      const pricePerShare = await ryskLqPool.withdrawalEpochPricePerShare(
        epoch.sub(1),
      );
      const amountToWithdraw = shares // 100e18
        .mul(pricePerShare) // 2e18
        .div(parseUnits('1', 18)) // 200e18
        .mul(parseUnits('1', 6)) // 200e24
        .div(parseUnits('1', 18)); // 200e6

      await increaseTime(time.duration.days(10));

      await strategy.connect(manager).withdrawToVault(amountToWithdraw);
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(keeper).completeWithdrawal();

      expect(await underlying.balanceOf(vault.address)).to.eq(amountToWithdraw);
    });
  });

  describe('#hasAssets', () => {
    it('returns false when no assets are invested', async () => {
      expect(await strategy.hasAssets()).to.be.false;
    });

    it('checks for pending deposit', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();

      expect(await strategy.hasAssets()).to.be.true;
    });

    it('checks for pending withdrawal', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(manager).withdrawToVault(parseUSDC('100'));

      expect(
        (await ryskLqPool.withdrawalReceipts(strategy.address)).shares,
      ).to.eq(parseUnits('100'));
      expect(await strategy.hasAssets()).to.be.true;
    });

    it('checks for redeemed shares', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(manager).withdrawToVault(parseUSDC('50'));
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(keeper).completeWithdrawal();

      expect(
        (await ryskLqPool.withdrawalReceipts(strategy.address)).shares,
      ).to.eq(parseUnits('0'));
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );

      expect(await strategy.hasAssets()).to.be.true;
    });
  });

  describe('#updateYieldDistributionCycle', () => {
    it('emits a StrategyNewYieldDistributionCycle event', async () => {
      await investToRyskLqPool(parseUSDC('100'));
      await addYieldToRyskLqPool(parseUSDC('100'));

      const tx = await strategy.updateYieldDistributionCycle();

      const cycleStartAmount = await strategy.cycleStartAmount();
      const cycleDuration = await strategy.cycleDuration();
      const cycleDistributionAmount = await strategy.cycleDistributionAmount();
      const cycleStartTimestamp = await strategy.cycleStartTimestamp();

      await expect(tx)
        .to.emit(strategy, 'StrategyNewYieldDistributionCycle')
        .withArgs(
          cycleStartTimestamp,
          cycleDuration,
          cycleDistributionAmount,
          cycleStartAmount,
        );
    });

    it(`starts a cycle when there isn't one`, async () => {
      await investToRyskLqPool(parseUSDC('100'));

      expect(await strategy.cycleStartAmount()).to.eq(parseUSDC('100'));
      expect(await strategy.cycleEndAmount()).to.eq(parseUSDC('100'));
      expect(await strategy.cycleDistributionAmount()).to.eq(parseUSDC('0'));
      expect(await strategy.cycleStartTimestamp()).to.eq(0);

      // generate 100 of yield
      await addYieldToRyskLqPool(parseUSDC('100'));
      await strategy.updateYieldDistributionCycle();

      expect(await strategy.cycleStartAmount()).to.eq(parseUSDC('100'));
      expect(await strategy.cycleEndAmount()).to.eq(parseUSDC('200'));
      expect(await strategy.cycleDistributionAmount()).to.eq(parseUSDC('100'));
      expect(await strategy.cycleStartTimestamp()).to.eq(
        await getLastBlockTimestamp(),
      );
    });

    it(`starts a cycle after the previous ended`, async () => {
      await investToRyskLqPool(parseUSDC('100'));

      await addYieldToRyskLqPool(parseUSDC('100'));
      await strategy.updateYieldDistributionCycle();

      await increaseTime(time.duration.days(11));

      await underlying.mint(ryskLqPool.address, parseUSDC('100'));
      await ryskLqPool.executeOnlyDepositEpochCalculation();
      await strategy.updateYieldDistributionCycle();

      expect(await strategy.cycleStartAmount()).to.eq(parseUSDC('200'));
      expect(await strategy.cycleEndAmount()).to.eq(parseUSDC('300'));
      expect(await strategy.cycleDistributionAmount()).to.eq(parseUSDC('100'));
      expect(await strategy.cycleStartTimestamp()).to.eq(
        await getLastBlockTimestamp(),
      );
    });

    it(`doesn't start a cycle after if there is no yield generated since previous cycle started`, async () => {
      await investToRyskLqPool(parseUSDC('100'));

      await addYieldToRyskLqPool(parseUSDC('100'));
      await strategy.updateYieldDistributionCycle();

      await increaseTime(time.duration.days(6));

      await expect(strategy.updateYieldDistributionCycle()).to.not.emit(
        strategy,
        'StrategyNewYieldDistributionCycle',
      );
    });

    it(`starts a cycle in the middle of another one`, async () => {
      await investToRyskLqPool(parseUSDC('100'));

      await addYieldToRyskLqPool(parseUSDC('100'));
      await strategy.updateYieldDistributionCycle();

      await increaseTime(time.duration.days(5));

      await underlying.mint(ryskLqPool.address, parseUSDC('100'));
      await ryskLqPool.executeOnlyDepositEpochCalculation();
      await strategy.updateYieldDistributionCycle();

      expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('150'));
      expect(await strategy.cycleEndAmount()).to.eq(parseUSDC('300'));
      expectEqualOrClose(
        await strategy.cycleDistributionAmount(),
        parseUSDC('150'),
      );
      expect(await strategy.cycleStartTimestamp()).to.eq(
        await getLastBlockTimestamp(),
      );
    });

    it(`starts a cycle with loss after the previous ended`, async () => {
      await investToRyskLqPool(parseUSDC('100'));

      await addYieldToRyskLqPool(parseUSDC('100'));
      await strategy.updateYieldDistributionCycle();

      await increaseTime(time.duration.days(11));

      await loseFundsFromRyskLqPool(parseUSDC('50'));
      await strategy.updateYieldDistributionCycle();

      expect(await strategy.cycleStartAmount()).to.eq(parseUSDC('150'));
      expect(await strategy.cycleEndAmount()).to.eq(parseUSDC('150'));
      expect(await strategy.cycleDistributionAmount()).to.eq(parseUSDC('0'));
      expect(await strategy.cycleStartTimestamp()).to.eq(
        await getLastBlockTimestamp(),
      );
    });

    it(`starts a cycle with loss while another one is ongoing`, async () => {
      await investToRyskLqPool(parseUSDC('100'));

      await addYieldToRyskLqPool(parseUSDC('100'));
      await strategy.updateYieldDistributionCycle();

      await increaseTime(time.duration.days(6));

      await loseFundsFromRyskLqPool(parseUSDC('80'));
      await strategy.updateYieldDistributionCycle();

      expect(await strategy.cycleStartAmount()).to.eq(parseUSDC('120'));
      expect(await strategy.cycleEndAmount()).to.eq(parseUSDC('120'));
      expect(await strategy.cycleDistributionAmount()).to.eq(parseUSDC('0'));
      expect(await strategy.cycleStartTimestamp()).to.eq(
        await getLastBlockTimestamp(),
      );
    });
  });

  describe('#investedAssets', async () => {
    it('returns 0 when no assets are invested', async () => {
      expect(await strategy.hasAssets()).to.be.false;
      expect(await strategy.investedAssets()).to.eq(0);
    });

    it('includes amount for deposits in the current epoch', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();

      expect(await strategy.investedAssets()).to.eq(parseUSDC('100'));
    });

    it('includes amount for pending withdrawal shares', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(manager).withdrawToVault(parseUSDC('100'));

      // generate yield to increase share value
      await underlying.mint(ryskLqPool.address, parseUSDC('100'));
      await ryskLqPool.executeEpochCalculation();

      // move forward so yield distribution is 100%
      await strategy.updateYieldDistributionCycle();
      await moveForwardTwoWeeks();

      expect(await strategy.investedAssets()).to.eq(parseUSDC('200'));
    });

    it('includes amount for redeemed shares', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(manager).withdrawToVault(parseUSDC('50'));
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(keeper).completeWithdrawal();

      expect(await underlying.balanceOf(vault.address)).to.eq(parseUSDC('50'));
      expect(await underlying.balanceOf(ryskLqPool.address)).to.eq(
        parseUSDC('50'),
      );
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );
      // generate yield to increase share value 2x
      await underlying.mint(
        ryskLqPool.address,
        await underlying.balanceOf(ryskLqPool.address),
      );
      await ryskLqPool.executeEpochCalculation();

      // move forward so yield distribution is 100%
      await strategy.updateYieldDistributionCycle();
      await moveForwardTwoWeeks();

      expect(
        (await ryskLqPool.withdrawalReceipts(strategy.address)).shares,
      ).to.eq(parseUnits('0'));
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );
      expect(await strategy.investedAssets()).to.eq(parseUSDC('100'));
    });

    it('includes amount for unredeemed shares', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // generate yield to increase share value 2x
      await underlying.mint(
        ryskLqPool.address,
        await underlying.balanceOf(ryskLqPool.address),
      );
      await ryskLqPool.executeOnlyDepositEpochCalculation();

      await ForkHelpers.impersonate([strategy.address]);
      const stratSigner = await ethers.getSigner(strategy.address);
      ForkHelpers.setBalance(stratSigner.address, parseUnits('1'));
      await ryskLqPool.connect(stratSigner).redeem(parseUnits('50'));

      // move forward so yield distribution is 100%
      await strategy.updateYieldDistributionCycle();
      await moveForwardTwoWeeks();

      // at this point we have 50 redeemed and 50 unredeemed shares (which doubled in value)
      expect(
        (await ryskLqPool.depositReceipts(strategy.address)).unredeemedShares,
      ).to.eq(parseUnits('50'));
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );
      expect(await strategy.investedAssets()).to.eq(parseUSDC('150'));
    });

    it('sums amounts for pending deposit, pending withdrawal, unredeemed and redeemed shares', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal to redeem all shares by withdrawing 50 of underlying
      // this will result in 50 shares on pending withdrawal receipt and 50 redeemed shares
      await strategy.connect(manager).withdrawToVault(parseUSDC('50'));

      // add 100 shares that will be unredeemed after next deposit
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();

      await ryskLqPool.executeEpochCalculation();

      // add 100 shares for pending deposit
      await underlying.mint(strategy.address, parseUSDC('100'));
      await strategy.connect(manager).invest();

      // total = 300
      // - pending deposit: 100
      // - unredeemed: 100
      // - redeemed: 50
      // - pending withdrawal: 50
      expect((await ryskLqPool.depositReceipts(strategy.address)).amount).to.eq(
        parseUSDC('100'),
      );
      expect(
        (await ryskLqPool.depositReceipts(strategy.address)).unredeemedShares,
      ).to.eq(parseUnits('100'));
      expect(
        (await ryskLqPool.withdrawalReceipts(strategy.address)).shares,
      ).to.eq(parseUnits('50'));
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );

      expect(await strategy.investedAssets()).to.eq(parseUSDC('300'));
    });

    it('distributes yield linearly over a period', async () => {
      const amount = parseUSDC('100');
      await underlying.mint(strategy.address, amount);
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      expect(await strategy.investedAssets()).to.eq(amount);

      // generate yield to increase share value 2x
      await underlying.mint(ryskLqPool.address, amount);
      await ryskLqPool.executeOnlyDepositEpochCalculation();
      await strategy.updateYieldDistributionCycle();

      // move to exactly 1 day since the block where we call invest
      await increaseTime(time.duration.days(1));

      for (let i = 10; i <= 100; i += 10) {
        const expected = amount.mul(100 + i).div(100);

        expectEqualOrClose(await strategy.investedAssets(), expected);

        await increaseTime(time.duration.days(1));
      }

      expect(await strategy.investedAssets()).to.eq(amount.mul(2));
    });

    it(`doesn't wait for another #updateYieldDistributionCycle to reflect the loss of funds`, async () => {
      await investToRyskLqPool(parseUSDC('100'));
      await addYieldToRyskLqPool(parseUSDC('100'));
      await strategy.updateYieldDistributionCycle();

      await increaseTime(time.duration.days(6));
      await loseFundsFromRyskLqPool(parseUSDC('50'));

      expect(await strategy.investedAssets()).to.eq(
        parseUSDC('100').add(parseUSDC('50')),
      );
    });

    it(`doesn't wait for another #updateYieldDistributionCycle to reflect the loss of funds from principal amount`, async () => {
      await investToRyskLqPool(parseUSDC('100'));
      await addYieldToRyskLqPool(parseUSDC('50'));
      await strategy.updateYieldDistributionCycle();

      await increaseTime(time.duration.days(6));
      await loseFundsFromRyskLqPool(parseUSDC('100'));

      expect(await strategy.investedAssets()).to.eq(parseUSDC('50'));
    });

    it(`doesn't reflect the loss of funds immediately if it only affected the yield to be distributed.`, async () => {
      await investToRyskLqPool(parseUSDC('100'));
      await addYieldToRyskLqPool(parseUSDC('100'));
      await strategy.updateYieldDistributionCycle();

      await increaseTime(time.duration.days(5));
      await loseFundsFromRyskLqPool(parseUSDC('10'));

      expectEqualOrClose(await strategy.investedAssets(), parseUSDC('150'));
    });

    describe('after a call to #updateYieldDistributionCycle', () => {
      it(`updates when a new epoch loses funds but doesn't become negative`, async () => {
        await investToRyskLqPool(parseUSDC('100'));
        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        await increaseTime(time.duration.days(5));

        await loseFundsFromRyskLqPool(parseUSDC('20'));
        await strategy.updateYieldDistributionCycle();

        // because it's exactly 5 days in the future, we know that only 50% of the yield is available
        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('150'));
        expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('150'));
        expectEqualOrClose(await strategy.cycleEndAmount(), parseUSDC('180'));

        await increaseTime(time.duration.days(5));

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('165'));

        await increaseTime(time.duration.days(5));

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('180'));
      });

      it(`updates when a new epoch loses user funds`, async () => {
        await investToRyskLqPool(parseUSDC('100'));
        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        await increaseTime(time.duration.days(5));

        await loseFundsFromRyskLqPool(parseUSDC('60'));
        await strategy.updateYieldDistributionCycle();

        // because it's exactly 5 days in the future, but we know some funds were lost
        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('140'));
        expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('140'));
        expectEqualOrClose(await strategy.cycleEndAmount(), parseUSDC('140'));

        await increaseTime(time.duration.days(11));

        expect(await strategy.investedAssets()).to.eq(parseUSDC('140'));
      });

      it('updates when a new epoch starts in the middle of a cycle', async () => {
        await investToRyskLqPool(parseUSDC('100'));
        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        await increaseTime(time.duration.days(5));

        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        // because it's exactly 5 days in the future, we know that only 50% of the yield is available
        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('150'));

        for (let i = 1; i <= 10; i += 1) {
          await increaseTime(time.duration.days(1));

          const expected = parseUSDC('150').add(
            parseUSDC('150')
              .mul(i * 10)
              .div(100),
          );

          expectEqualOrClose(await strategy.investedAssets(), expected);
        }

        expect(await strategy.investedAssets()).to.eq(parseUSDC('300'));
      });

      it('handles a new deposit during a cycle', async () => {
        await investToRyskLqPool(parseUSDC('100'));
        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        await increaseTime(time.duration.days(5));

        await investToRyskLqPool(parseUSDC('100'));

        // because it's exactly 5 days in the future, we know that only 50% of the yield is available
        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('250'));

        await increaseTime(time.duration.days(5));

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('300'));
        expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('200'));
        expectEqualOrClose(await strategy.cycleEndAmount(), parseUSDC('300'));
      });

      it('handles a withdrawal during a cycle', async () => {
        await investToRyskLqPool(parseUSDC('100'));
        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        await increaseTime(time.duration.days(5));

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('150'));

        await strategy.connect(manager).withdrawToVault(parseUSDC('150'));

        await ryskLqPool.executeEpochCalculation();

        await strategy.connect(keeper).completeWithdrawal();

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('0'));
        expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('0'));
        expectEqualOrClose(await strategy.cycleEndAmount(), parseUSDC('50'));

        await increaseTime(time.duration.days(6));

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('50'));
        expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('0'));
        expectEqualOrClose(await strategy.cycleEndAmount(), parseUSDC('50'));
      });

      it("doesn't update cycle after withdrawal", async () => {
        await investToRyskLqPool(parseUSDC('100'));
        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        await increaseTime(time.duration.days(5));

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('150'));

        await strategy.connect(manager).withdrawToVault(parseUSDC('150'));

        await ryskLqPool.executeEpochCalculation();

        await strategy.connect(keeper).completeWithdrawal();

        await increaseTime(time.duration.days(2));
        const tx = await strategy.updateYieldDistributionCycle();

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('20'));
        expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('0'));
        expectEqualOrClose(await strategy.cycleEndAmount(), parseUSDC('50'));
        await expect(tx).to.not.emit(
          strategy,
          'StrategyNewYieldDistributionCycle',
        );
      });

      it('handles multiple withdrawals during a cycle and updates cycle sucessfully after', async () => {
        // 1. deposit 100 and generate 100 in yield
        // 2. move forward 5 days and withdraw 150 => 0 available and 50 left to distribute
        // 3. move forward 3 days and withdraw 10 => 20 available and 20 left to distribute
        // 4. genearte 100 in yield and update cycle => 20 available and 120 left to distribute
        // 4. move forward 5 days and withdraw 50 => 40 avaialble and 60 left to distribute
        //
        await investToRyskLqPool(parseUSDC('100'));
        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        await increaseTime(time.duration.days(5));

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('150'));

        await strategy.connect(manager).withdrawToVault(parseUSDC('150'));
        await ryskLqPool.executeEpochCalculation();
        await strategy.connect(keeper).completeWithdrawal();

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('0'));
        expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('0'));
        expectEqualOrClose(await strategy.cycleEndAmount(), parseUSDC('50'));

        await increaseTime(time.duration.days(3));

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('30'));

        await strategy.connect(manager).withdrawToVault(parseUSDC('10'));
        await ryskLqPool.executeEpochCalculation();
        await strategy.connect(keeper).completeWithdrawal();

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('20'));
        expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('0'));
        expectEqualOrClose(await strategy.cycleEndAmount(), parseUSDC('40'));

        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('20'));
        expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('20'));
        expectEqualOrClose(await strategy.cycleEndAmount(), parseUSDC('140'));

        await increaseTime(time.duration.days(5));

        await strategy.connect(manager).withdrawToVault(parseUSDC('50'));
        await ryskLqPool.executeEpochCalculation();
        await strategy.connect(keeper).completeWithdrawal();
        await strategy.updateYieldDistributionCycle();

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('30'));
        expectEqualOrClose(await strategy.cycleStartAmount(), parseUSDC('0'));
        expectEqualOrClose(await strategy.cycleEndAmount(), parseUSDC('90'));
      });
    });
  });

  describe('#setYieldDistributionCycleDuration', () => {
    it('fails if caller not SETTINGS', async () => {
      await expect(
        strategy.connect(manager).setYieldDistributionCycleDuration(1),
      ).to.be.revertedWith('StrategyCallerNotSettings');
    });

    it('fails if new cycle druation is greater than max', async () => {
      const invalidCycleDuration = (await strategy.MAX_CYCLE_DURATION()).add(1);

      await expect(
        strategy
          .connect(admin)
          .setYieldDistributionCycleDuration(invalidCycleDuration),
      ).to.be.revertedWith('StrategyInvalidYieldDistributionCycleDuration');
    });

    it('fails if new cycle druation is less than min', async () => {
      const invalidCycleDuration = (await strategy.MIN_CYCLE_DURATION()).sub(1);

      await expect(
        strategy
          .connect(admin)
          .setYieldDistributionCycleDuration(invalidCycleDuration),
      ).to.be.revertedWith('StrategyInvalidYieldDistributionCycleDuration');
    });

    it('works when new duration is less than max and greater than min', async () => {
      const cycleDuration = await strategy.MIN_CYCLE_DURATION();

      await strategy
        .connect(admin)
        .setYieldDistributionCycleDuration(cycleDuration);

      expect(await strategy.cycleDuration()).to.eq(cycleDuration);
    });

    describe('after a call to #updateYieldDistributionCycle', () => {
      it('shortens the cycle if new duration is less than current cycle duration', async () => {
        await investToRyskLqPool(parseUSDC('100'));
        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        increaseTime(time.duration.days(2));

        const newCycleDuration = time.duration.days(4).toString();

        await strategy
          .connect(admin)
          .setYieldDistributionCycleDuration(newCycleDuration);

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('150'));
      });

      it('lengthens the cycle if new duration is greater than current cycle duration', async () => {
        await investToRyskLqPool(parseUSDC('100'));
        await addYieldToRyskLqPool(parseUSDC('100'));
        await strategy.updateYieldDistributionCycle();

        increaseTime(YIELD_CYCLE_DURATION);

        const newCycleDuration = BigNumber.from(YIELD_CYCLE_DURATION).mul(2);

        await strategy
          .connect(admin)
          .setYieldDistributionCycleDuration(newCycleDuration);

        expectEqualOrClose(await strategy.investedAssets(), parseUSDC('150'));
      });
    });
  });

  async function investToRyskLqPool(amount: BigNumber) {
    await underlying.mint(strategy.address, amount);
    await strategy.connect(manager).invest();
    await ryskLqPool.executeEpochCalculation();
  }

  async function addYieldToRyskLqPool(amount: BigNumber) {
    await underlying.mint(ryskLqPool.address, amount);
    await ryskLqPool.executeEpochCalculation();
  }

  function expectEqualOrClose(
    actual: BigNumber,
    expected: BigNumber,
    tolerance: BigNumber = parseUSDC('0.01'),
  ) {
    const diff = actual.sub(expected).abs();
    if (diff.gt(tolerance)) {
      expect.fail(
        `expected ${actual.toString()} to be within ${expected.toString()} ± ${tolerance.toString()}`,
      );
    }
  }

  async function loseFundsFromRyskLqPool(amount: BigNumber) {
    const currentBalance = await underlying.balanceOf(ryskLqPool.address);

    await ForkHelpers.setTokenBalance(
      underlying,
      ryskLqPool,
      currentBalance.sub(amount),
    );
    await ryskLqPool.executeEpochCalculation();
  }
});
