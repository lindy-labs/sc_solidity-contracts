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
  let owner: SignerWithAddress;
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
    [owner, alice, manager] = await ethers.getSigners();

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
      owner.address,
      BigNumber.from('0'), // PERFORMANCE_FEE_PCT
      BigNumber.from('0'), // INVESTMENT_FEE_PCT,
      [],
    );

    RyskStrategyFactory = await ethers.getContractFactory('RyskStrategy');

    strategy = await RyskStrategyFactory.deploy(
      vault.address,
      owner.address,
      ryskLqPool.address,
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
        RyskStrategyFactory.deploy(
          vault.address,
          constants.AddressZero,
          ryskLqPool.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyOwnerCannotBe0Address');
    });

    it('reverts if the Rysk liquidity pool is address(0)', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          vault.address,
          owner.address,
          constants.AddressZero,
          underlying.address,
        ),
      ).to.be.revertedWith('RyskLiquidityPoolCannotBe0Address');
    });

    it('reverts if underlying is address(0)', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          vault.address,
          owner.address,
          ryskLqPool.address,
          constants.AddressZero,
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it('reverts if vault does not have IVault interface', async () => {
      await expect(
        RyskStrategyFactory.deploy(
          manager.address, // vault param
          owner.address,
          ryskLqPool.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyNotIVault');
    });

    it('sets initial values as expected', async () => {
      expect(await strategy.vault()).to.eq(vault.address);
      expect(await strategy.owner()).to.eq(owner.address);
      expect(await strategy.ryskLqPool()).to.eq(ryskLqPool.address);
      expect(await strategy.underlying()).to.eq(underlying.address);

      expect(await strategy.isSync()).to.be.false;

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be
        .true;
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.true;

      expect(
        await underlying.allowance(strategy.address, ryskLqPool.address),
      ).to.eq(constants.MaxUint256);
    });
  });

  describe('#transferOwnership', () => {
    it('can only be called by the current owner', async () => {
      await expect(
        strategy.connect(alice).transferOwnership(alice.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
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

    it('changes ownership to the new owner', async () => {
      await strategy.connect(owner).transferOwnership(alice.address);

      expect(await strategy.owner()).to.be.equal(alice.address);
    });

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

    it('moves underlying to the Rysk liquidity pool', async () => {
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

    it('receives a deposit receipt with amount of unredeemed shares', async () => {
      const underlyingAmount = parseUnits('100');
      await underlying.mint(strategy.address, underlyingAmount);
      const epoch = await ryskLqPool.epoch();
      expect(await underlying.balanceOf(ryskLqPool.address)).to.eq(0);

      await strategy.connect(manager).invest();

      const depositReceipt = await ryskLqPool.depositReceipts(strategy.address);
      expect(depositReceipt.epoch).to.eq(epoch);
      expect(depositReceipt.amount).to.eq(underlyingAmount);
      // underlying amount = shares amount, because price per share = 1 underlying
      expect(depositReceipt.unredeemedShares).to.eq(underlyingAmount);
      // new shares are minted for the deposit
      expect(await underlying.balanceOf(ryskLqPool.address)).to.eq(
        underlyingAmount,
      );
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
      expect(withdrawalReceipt.epoch).to.eq(await ryskLqPool.epoch());
      // shares = amountToWithdraw because price per share = 1 underlying
      expect(withdrawalReceipt.shares).to.eq(amountToWithdraw);
    });

    it('emits RyskWithdrawalInitiated event', async () => {
      let underlyingAmount = parseUnits('100');
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();

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
      const unredeemedShares = (
        await ryskLqPool.depositReceipts(strategy.address)
      ).unredeemedShares;

      await strategy.connect(manager).withdrawToVault(parseUnits('50'));

      // shares are redeemed
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        unredeemedShares,
      );
      expect(
        (await ryskLqPool.depositReceipts(strategy.address)).unredeemedShares,
      ).to.eq(0);
    });

    it('fails when amount to withdraw > owned shares', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      const amountTooBig = parseUnits('150');
      await expect(
        strategy.connect(manager).withdrawToVault(amountTooBig),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('fails when called multiple times with end amount to withdraw > owned shares', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      // first call
      const amountOk = parseUnits('90');
      await strategy.connect(manager).withdrawToVault(amountOk);

      // second call
      const amountTooBig = parseUnits('110');
      await expect(
        strategy.connect(manager).withdrawToVault(amountTooBig),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('initiates withdrawal for the greatest amount when called multiple times in the same epoch', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      await ryskLqPool.advanceEpoch();

      // initiate withdrawals
      await strategy.connect(manager).withdrawToVault(parseUnits('60'));
      await strategy.connect(manager).withdrawToVault(parseUnits('50'));

      const endAmountToWithdraw = parseUnits('70');
      await strategy.connect(manager).withdrawToVault(endAmountToWithdraw);

      const withdrawalReceipt = await ryskLqPool.withdrawalReceipts(
        strategy.address,
      );

      expect(withdrawalReceipt.epoch).to.eq(await ryskLqPool.epoch());
      // 1 share = 1 underlying
      expect(withdrawalReceipt.shares).to.eq(endAmountToWithdraw);
    });

    it('overrides the withdrawal amount from previous epoch when withdrawal was not completed', async () => {
      let underlyingAmount = parseUnits('100');
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();

      // initiate withdrawal
      await strategy.connect(manager).withdrawToVault(parseUnits('50'));

      await ryskLqPool.advanceEpoch();

      // initiate another withdrawal in new epoch without completing the previous one
      const endAmountToWithdraw = parseUnits('30');
      await strategy.connect(manager).withdrawToVault(endAmountToWithdraw);

      const withdrawalReceipt = await ryskLqPool.withdrawalReceipts(
        strategy.address,
      );

      expect(withdrawalReceipt.epoch).to.eq(await ryskLqPool.epoch());
      expect(withdrawalReceipt.shares).to.eq(endAmountToWithdraw);
    });
  });

  describe('#completeWithdrawal', () => {
    it('fails if withdrawal is not initiated', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      await expect(
        strategy.connect(manager).completeWithdrawal(),
      ).to.be.revertedWith('RyskNoWithdrawalInitiated');
    });

    it('fails if epoch has not advanced', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      // initiate withdrawal
      await strategy.connect(manager).withdrawToVault(parseUnits('50'));

      await expect(strategy.completeWithdrawal()).to.be.revertedWith(
        'RyskCannotComipleteWithdrawalInSameEpoch',
      );
    });

    it('works if epoch has advanced', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      // initiate withdrawal
      const amountToWithdraw = parseUnits('50');
      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      // advance epoch
      await ryskLqPool.advanceEpoch();

      await strategy.completeWithdrawal();

      expect(await underlying.balanceOf(vault.address)).to.eq(amountToWithdraw);
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );
    });

    it('emits strategy withdrawn event', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      // initiate withdrawal
      const amountToWithdraw = parseUnits('50');
      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      // advance epoch
      await ryskLqPool.advanceEpoch();

      const tx = await strategy.completeWithdrawal();

      await expect(tx)
        .to.emit(strategy, 'StrategyWithdrawn')
        .withArgs(amountToWithdraw);
    });

    it('works when yield is generated on Rysk liquidity pool', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      // generate yield
      underlying.mint(ryskLqPool.address, parseUnits('100'));
      await ryskLqPool.advanceEpoch();

      // initiate withdrawal
      const epoch = await ryskLqPool.epoch();
      const shares = await ryskLqPool.totalSupply();
      const pricePerShare = await ryskLqPool.epochPricePerShare(epoch);
      const amountToWithdraw = shares
        .mul(pricePerShare)
        .div(parseUnits('1', 18));

      await strategy.connect(manager).withdrawToVault(amountToWithdraw);
      await ryskLqPool.advanceEpoch();

      await strategy.completeWithdrawal();

      expect(await underlying.balanceOf(vault.address)).to.eq(amountToWithdraw);
    });

    it('works when withdrawal was initiated multiple times in two different epochs', async () => {
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      // initiate withdrawals
      await strategy.connect(manager).withdrawToVault(parseUnits('50'));
      await strategy.connect(manager).withdrawToVault(parseUnits('60'));

      await ryskLqPool.advanceEpoch();

      // initiate more withdrawals in new epoch without completing the previous one
      await strategy.connect(manager).withdrawToVault(parseUnits('30'));

      const endAmountToWithdraw = parseUnits('40');
      await strategy.connect(manager).withdrawToVault(endAmountToWithdraw);

      await ryskLqPool.advanceEpoch();

      await strategy.completeWithdrawal();

      expect(await underlying.balanceOf(vault.address)).to.eq(
        endAmountToWithdraw,
      );
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await ryskLqPool.balanceOf(strategy.address)).to.eq(
        parseUnits('60'),
      );
      expect(await strategy.investedAssets()).to.eq(parseUnits('60'));
    });
  });

  describe('#investedAssets', async () => {
    it('returns 0 when no assets are invested', async () => {
      expect(await strategy.hasAssets()).to.be.false;
      expect(await strategy.investedAssets()).to.eq(0);
    });

    it('includes unredeemed and redeemed shares', async () => {
      let underlyingAmount = parseUnits('100');
      await underlying.mint(strategy.address, parseUnits('100'));
      await strategy.connect(manager).invest();

      // initiate withdrawal and redeem all shares
      await strategy.connect(manager).withdrawToVault(underlyingAmount);

      // invest again to get unredeemed shares
      await underlying.mint(strategy.address, underlyingAmount);
      await strategy.connect(manager).invest();

      expect(await strategy.hasAssets()).to.be.true;
      expect(await strategy.investedAssets()).to.eq(underlyingAmount.mul(2));
    });
  });
});
