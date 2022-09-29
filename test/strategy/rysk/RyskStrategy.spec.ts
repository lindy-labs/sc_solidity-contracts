import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockRyskLiquidityPool,
  RyskStrategy,
  MockERC20,
  RyskStrategy__factory,
} from '../../../typechain';

import { generateNewAddress } from '../../shared/';
import { parseUnits } from 'ethers/lib/utils';

describe('RyskStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let ryskLqPool: MockRyskLiquidityPool;
  let strategy: RyskStrategy;
  let underlying: MockERC20;

  let RyskStrategyFactory: RyskStrategy__factory;

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    [admin, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockUSDC');
    underlying = await MockERC20.deploy(parseUnits('1000000000'));

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
    );

    RyskStrategyFactory = await ethers.getContractFactory('RyskStrategy');

    strategy = await RyskStrategyFactory.deploy(
      vault.address,
      admin.address,
      ryskLqPool.address,
      underlying.address,
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
          ryskLqPool.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyAdminCannotBe0Address');
    });

    it('reverts if the Rysk liquidity pool is address(0)', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          vault.address,
          admin.address,
          constants.AddressZero,
          underlying.address,
        ),
      ).to.be.revertedWith('RyskLiquidityPoolCannotBe0Address');
    });

    it('reverts if underlying is address(0)', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          vault.address,
          admin.address,
          ryskLqPool.address,
          constants.AddressZero,
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it('reverts if vault does not have IVault interface', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          manager.address, // vault param
          admin.address,
          ryskLqPool.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyNotIVault');
    });

    it('sets initial values as expected', async () => {
      expect(await strategy.vault()).to.eq(vault.address);
      expect(await strategy.ryskLqPool()).to.eq(ryskLqPool.address);
      expect(await strategy.underlying()).to.eq(underlying.address);

      expect(await strategy.isSync()).to.be.false;

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.true;

      expect(
        await underlying.allowance(strategy.address, ryskLqPool.address),
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

    it('transfers admin rights from current account to the new one', async () => {
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;

      await strategy.connect(admin).transferAdminRights(alice.address);

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .false;

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .true;
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
      const underlyingAmount = parseUnits('100');
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
      const underlyingAmount = parseUnits('100');
      await underlying.mint(strategy.address, underlyingAmount);

      const tx = await strategy.connect(manager).invest();

      await expect(tx)
        .to.emit(strategy, 'StrategyInvested')
        .withArgs(underlyingAmount);
    });

    it('receives a deposit receipt', async () => {
      const underlyingAmount = parseUnits('100');
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
      const underlyingAmount = parseUnits('100');
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      const amountToWithdraw = parseUnits('100');
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
      expect(withdrawalReceipt.shares).to.eq(amountToWithdraw);
    });

    it('caches initiated (pending) withdrawal', async () => {
      const underlyingAmount = parseUnits('100');
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      const amountToWithdraw = parseUnits('100');
      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      const withdrawalReceipt = await ryskLqPool.withdrawalReceipts(
        strategy.address,
      );
      expect((await strategy.pendingWithdrawal()).epoch).to.eq(
        withdrawalReceipt.epoch,
      );
      expect((await strategy.pendingWithdrawal()).shares).to.eq(
        withdrawalReceipt.shares,
      );
    });

    it('emits RyskWithdrawalInitiated event', async () => {
      let underlyingAmount = parseUnits('100');
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      const amountToWithdraw = parseUnits('50');

      const tx = await strategy
        .connect(manager)
        .withdrawToVault(amountToWithdraw);

      await expect(tx)
        .to.emit(strategy, 'RyskWithdrawalInitiated')
        .withArgs(amountToWithdraw);
    });

    it('redeems all currently unredeemed shares', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await strategy.connect(manager).withdrawToVault(parseUnits('50'));

      // all unredeemed shares are redeemed when a withdrawal is initiated
      expect(
        (await ryskLqPool.depositReceipts(strategy.address)).unredeemedShares,
      ).to.eq(0);
    });

    it('fails when amount to withdraw > owned shares', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      const amountTooBig = parseUnits('150');
      await expect(
        strategy.connect(manager).withdrawToVault(amountTooBig),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('fails when called multiple times with end amount to withdraw > owned shares', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // first call
      const amountOk = parseUnits('90');
      await strategy.connect(manager).withdrawToVault(amountOk);

      // second call
      const amountTooBig = parseUnits('110');
      await expect(
        strategy.connect(manager).withdrawToVault(amountTooBig),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('aggregates initiated withdrawal amounts (in shares) when called multiple times in the same withdrawal epoch', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawals
      await strategy.connect(manager).withdrawToVault(parseUnits('60'));
      await strategy.connect(manager).withdrawToVault(parseUnits('40'));

      const pendingWithdrawal = await strategy.pendingWithdrawal();
      expect(pendingWithdrawal.epoch).to.eq(await ryskLqPool.withdrawalEpoch());
      // 1 mocked share = 1 underlying
      expect(pendingWithdrawal.shares).to.eq(parseUnits('100'));
    });

    it('fails if pending withdrawal from previous withdrawal epoch was not completed', async () => {
      let underlyingAmount = parseUnits('100');
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal
      await strategy.connect(manager).withdrawToVault(parseUnits('50'));

      await ryskLqPool.executeEpochCalculation();

      // initiate another withdrawal in new epoch without completing the previous one
      const endAmountToWithdraw = parseUnits('30');
      await expect(
        strategy.connect(manager).withdrawToVault(endAmountToWithdraw),
      ).to.be.revertedWith('RyskPendingWithdrawalNotCompleted');
    });
  });

  describe('#completeWithdrawal', () => {
    it('fails if withdrawal is not initiated', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      await expect(
        strategy.connect(manager).completeWithdrawal(),
      ).to.be.revertedWith('RyskNoWithdrawalInitiated');
    });

    it('fails if epoch has not advanced', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal
      await strategy.connect(manager).withdrawToVault(parseUnits('50'));

      await expect(strategy.completeWithdrawal()).to.be.revertedWith(
        'RyskCannotCompleteWithdrawalInSameEpoch',
      );
    });

    it('works if epoch has advanced', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal
      const amountToWithdraw = parseUnits('50');
      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      // advance epoch
      await ryskLqPool.executeEpochCalculation();

      await strategy.completeWithdrawal();

      expect(await underlying.balanceOf(vault.address)).to.eq(amountToWithdraw);
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );
    });

    it('clears cached pending withdrawal', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      const amountToWithdraw = parseUnits('50');
      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      await ryskLqPool.executeEpochCalculation();

      await strategy.completeWithdrawal();

      const pendingWithdrawal = await strategy.pendingWithdrawal();
      expect(pendingWithdrawal.epoch).to.eq('0');
      expect(pendingWithdrawal.shares).to.eq('0');
    });

    it('emits strategy withdrawn event', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal
      const amountToWithdraw = parseUnits('50');
      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      // advance epoch
      await ryskLqPool.executeEpochCalculation();

      const tx = await strategy.completeWithdrawal();

      await expect(tx)
        .to.emit(strategy, 'StrategyWithdrawn')
        .withArgs(amountToWithdraw);
    });

    it('works when yield is generated on Rysk liquidity pool', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // generate yield
      await underlying.mint(ryskLqPool.address, parseUnits('100'));
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal
      const epoch = await ryskLqPool.withdrawalEpoch();
      const shares = await ryskLqPool.totalSupply();
      const pricePerShare = await ryskLqPool.withdrawalEpochPricePerShare(
        epoch,
      );
      const amountToWithdraw = shares
        .mul(pricePerShare)
        .div(parseUnits('1', 18));

      await strategy.connect(manager).withdrawToVault(amountToWithdraw);
      await ryskLqPool.executeEpochCalculation();

      await strategy.completeWithdrawal();

      expect(await underlying.balanceOf(vault.address)).to.eq(amountToWithdraw);
    });
  });

  describe('#investedAssets', async () => {
    it('returns 0 when no assets are invested', async () => {
      expect(await strategy.hasAssets()).to.be.false;
      expect(await strategy.investedAssets()).to.eq(0);
    });

    it('includes into account pending, unredeemed, redeemed shares and shares in pending withdrawal', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // initiate withdrawal to redeem all shares by withdrawing 50 of underlying
      // this will result in 50 shares on pending withdrawal receipt and 50 redeemed shares
      await strategy.connect(manager).withdrawToVault(parseUnits('50'));

      // add 100 unredeemed shares
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();
      await ryskLqPool.executeEpochCalculation();

      // add 100 shares for pending deposit
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      // all shares
      // - pending deposit: 100
      // - unredeemed: 100
      // - redeemed: 50
      // - pending withdrawal: 50
      expect(
        (await ryskLqPool.depositReceipts(strategy.address)).unredeemedShares,
      ).to.eq(parseUnits('100'));
      expect((await strategy.pendingWithdrawal()).shares).to.eq(
        parseUnits('50'),
      );
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );

      expect(await strategy.hasAssets()).to.be.true;
      expect(await strategy.investedAssets()).to.eq(parseUnits('300'));
    });
  });
});
