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

describe('YearnStrategy', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let yVault: MockYearnVault;
  let strategy: YearnStrategy;
  let lusd: MockERC20;
  let underlying: MockERC20;
  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = 1;
  const TWO_WEEKS = time.duration.days(14).toNumber();
  const PERFORMANCE_FEE_PCT = BigNumber.from('200');
  const INVEST_PCT = BigNumber.from('9000');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');
  const DENOMINATOR = BigNumber.from('10000');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    [owner, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    lusd = await MockERC20.deploy(
      'LUSD',
      'LUSD',
      18,
      utils.parseEther('1000000000'),
    );

    underlying = lusd;

    // deploy yearn lusd vault
    const yVaultFactory = await ethers.getContractFactory('MockYearnVault');

    yVault = await yVaultFactory.deploy(
      'Yearn LUSD Vault',
      'yLusd',
      underlying.address,
    );

    // deploy sandclock vault
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

    const YearnStrategyFactory = await ethers.getContractFactory(
      'YearnStrategy',
    );

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
    let YearnStrategyFactory: YearnStrategy__factory;

    beforeEach(async () => {
      YearnStrategyFactory = await ethers.getContractFactory('YearnStrategy');
    });

    it('Revert if owner is address(0)', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          vault.address,
          constants.AddressZero,
          yVault.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyOwnerCannotBe0Address');
    });
    it('Revert if owner is address(0)', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          vault.address,
          owner.address,
          constants.AddressZero,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyYieldTokenCannotBe0Address');
    });
    it('Revert if owner is address(0)', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          vault.address,
          owner.address,
          yVault.address,
          constants.AddressZero,
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it('Revert if vault does not have IVault interface', async () => {
      await expect(
        YearnStrategyFactory.deploy(
          manager.address,
          owner.address,
          yVault.address,
          underlying.address,
        ),
      ).to.be.revertedWith('StrategyNotIVault');
    });

    it('Check initial values', async () => {
      expect(await strategy.isSync()).to.be.equal(true);
      expect(
        await strategy.hasRole(DEFAULT_ADMIN_ROLE, owner.address),
      ).to.be.equal(true);
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.equal(
        true,
      );
      expect(await strategy.vault()).to.be.equal(vault.address);
      expect(await strategy.yVault()).to.be.equal(yVault.address);

      expect(await strategy.underlying()).to.be.equal(lusd.address);
      expect(await strategy.hasAssets()).to.be.equal(false);
    });
  });

  describe('#invest function', () => {
    it('Revert if msg.sender is not manager', async () => {
      await expect(strategy.connect(alice).invest()).to.be.revertedWith(
        'StrategyCallerNotManager',
      );
    });

    it('Revert if underlying balance is zero', async () => {
      await expect(strategy.connect(manager).invest()).to.be.revertedWith(
        'StrategyNoUnderlying',
      );
    });

    it('Should deposit stable with all undelrying', async () => {
      let underlyingAmount = utils.parseUnits('100', 18);
      await depositVault(underlyingAmount);

      let investAmount = underlyingAmount.mul(INVEST_PCT).div(DENOMINATOR);

      expect(await vault.totalUnderlying()).equal(underlyingAmount);
      expect(await strategy.investedAssets()).equal(0);
      expect(await strategy.hasAssets()).equal(false);

      const tx = await vault.connect(owner).updateInvested();

      expect(await underlying.balanceOf(yVault.address)).equal(investAmount);
      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await strategy.investedAssets()).equal(investAmount);
      expect(await strategy.hasAssets()).equal(true);
      expect(await vault.totalUnderlying()).equal(underlyingAmount);

      await expect(tx)
        .to.emit(strategy, 'StrategyInvested')
        .withArgs(investAmount);
    });

    it('Should be able to call deposit multiple times', async () => {
      let underlyingBalance0 = utils.parseUnits('100', 18);
      await depositVault(underlyingBalance0);

      let investAmount0 = underlyingBalance0.mul(INVEST_PCT).div(DENOMINATOR);

      await vault.connect(owner).updateInvested();

      let underlyingBalance1 = utils.parseUnits('50', 18);
      await depositVault(underlyingBalance1);

      let investAmount1 = underlyingBalance1
        .add(underlyingBalance0)
        .mul(INVEST_PCT)
        .div(DENOMINATOR)
        .sub(investAmount0);

      await vault.connect(owner).updateInvested();

      expect(await underlying.balanceOf(strategy.address)).equal(0);

      expect(await strategy.investedAssets()).equal(
        investAmount0.add(investAmount1),
      );
      expect(await vault.totalUnderlying()).equal(
        underlyingBalance0.add(underlyingBalance1),
      );
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

    it('can deduct all invested funds from strategy', async () => {
      let underlyingAmount = utils.parseEther('100');
      await depositVault(underlyingAmount);

      let investAmount = underlyingAmount.mul(INVEST_PCT).div(DENOMINATOR);

      await vault.connect(owner).updateInvested();

      expect(await strategy.investedAssets()).to.be.equal(investAmount);

      let tx = await strategy.connect(manager).withdrawToVault(investAmount);

      expect(await yVault.balanceOf(strategy.address)).to.be.equal('0');
      expect(await strategy.investedAssets()).to.be.equal('0');

      await expect(tx)
        .to.emit(strategy, 'StrategyWithdrawn')
        .withArgs(investAmount);
    });
  });

  const depositVault = async (amount: BigNumber) => {
    await vault.connect(owner).deposit({
      amount,
      inputToken: underlying.address,
      claims: [
        {
          pct: DENOMINATOR,
          beneficiary: owner.address,
          data: '0x',
        },
      ],
      lockDuration: TWO_WEEKS,
      name: 'Foundation name',
    });
  };
});

// permissions, control tests, only righb accounts can call certain functions,
// tests for the custom errors, and the custom errors are thrown when certain conditions are met.
// events are emitted when certain functions are called
