import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';
import { time } from '@openzeppelin/test-helpers';

import {
  Vault,
  MockYearnVault,
  YearnStrategy,
  MockERC20,
  YearnStrategy__factory,
} from '../typechain';

import { generateNewAddress, moveForwardTwoWeeks } from './shared/';
import { parseUnits } from 'ethers/lib/utils';

let owner: SignerWithAddress;
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
const UNDERLYING_DECIMALS = '18';
const TWO_WEEKS = time.duration.days(14).toNumber();

const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

describe('Audit Tests 4', () => {
  describe('issue H-1', () => {
    beforeEach(async () => await beforeEachCommon(UNDERLYING_DECIMALS));

    describe('YearnStrategy#withdrawToVault', () => {
      it('works if there is a precision loss when converting shares to underlying', async () => {
        // mint 90 to startegy
        underlying.mint(strategy.address, parseUnits('90'));
        // mint 10 to yVault to change price per share
        underlying.mint(yVault.address, parseUnits('10'));
        strategy.connect(manager).invest();

        // at this point we have 90 shares and 100 total underlying in yVault
        // which will cause rounding errors when calculating price per share
        const tx = await strategy
          .connect(manager)
          .withdrawToVault(parseUnits('30'));

        const expectedAmountWithdrawn = '29999999999999999999';
        expect(await underlying.balanceOf(vault.address)).to.eq(
          expectedAmountWithdrawn,
        );
        expect(await underlying.balanceOf(yVault.address)).to.eq(
          '70000000000000000001',
        );
        await expect(tx)
          .to.emit(strategy, 'StrategyWithdrawn')
          .withArgs(expectedAmountWithdrawn);
      });

      it("calls Yearn vault 'withdraw' function with param 'maxLoss' default value of 1", async () => {
        const defaultMaxLoss = '1';
        underlying.mint(strategy.address, parseUnits('100'));
        strategy.connect(manager).invest();

        await strategy.connect(manager).withdrawToVault(parseUnits('30'));

        expect(await yVault.maxLossWithdrawParam()).to.eq(defaultMaxLoss);
      });
    });
  });

  describe('issue H-2', () => {
    beforeEach(async () => await beforeEachCommon(UNDERLYING_DECIMALS));

    describe('Vault#unsponsor', () => {
      it('works when not enough funds in the vault by withdrawing from sync strategy', async () => {
        const underlyingAmount = parseUnits('1000');
        await underlying.mint(owner.address, underlyingAmount);

        await vault
          .connect(owner)
          .sponsor(underlying.address, underlyingAmount, TWO_WEEKS);
        await vault.connect(owner).updateInvested();
        await moveForwardTwoWeeks();

        // at this point we have all the underlying invested
        expect(await strategy.investedAssets()).to.eq(underlyingAmount);
        expect(await underlying.balanceOf(vault.address)).to.eq('0');

        await vault.connect(owner).unsponsor(manager.address, [1]);

        expect(await strategy.investedAssets()).to.eq('0');
        expect(await underlying.balanceOf(vault.address)).to.eq('0');
        expect(await underlying.balanceOf(manager.address)).to.eq(
          underlyingAmount,
        );
      });
    });
  });

  describe('issue H-3', () => {
    const underlyingDecimals = '8';
    beforeEach(async () => await beforeEachCommon(underlyingDecimals));

    describe('YearnStrategy#withdrawToVault', () => {
      it('works converting underlying <=> shares when decimals != 18', async () => {
        const underlyingAmount = parseUnits('100', underlyingDecimals);
        underlying.mint(strategy.address, underlyingAmount);
        strategy.connect(manager).invest();

        await strategy
          .connect(manager)
          .withdrawToVault(underlyingAmount.div(2));

        expect(await strategy.decimalMultiplier()).to.eq(1e8);
        expect(await yVault.decimals()).to.eq(await underlying.decimals());
        expect(await underlying.balanceOf(vault.address)).to.eq(
          parseUnits('50', underlyingDecimals),
        );
        expect(await underlying.balanceOf(yVault.address)).to.eq(
          parseUnits('50', underlyingDecimals),
        );
      });
    });
  });

  describe('issue M-5', () => {
    beforeEach(async () => await beforeEachCommon(UNDERLYING_DECIMALS));

    describe('YearnStrategy#setWithdrawalMaxLossParam', () => {
      it('fails if the caller is not owner', async () => {
        await expect(
          strategy.connect(manager).setMaxLossWithdrawParam('2'),
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('sets the max loss withdraw param', async () => {
        const maxLoss = '2';

        await strategy.setMaxLossWithdrawParam(maxLoss);

        expect(await strategy.maxLossWithdrawParam()).to.eq(maxLoss);
      });

      it('defaults to 100% when the max loss withdraw param > 100%', async () => {
        // 1 = 0.01%
        const maxLoss = '10001'; // 100.01%

        await strategy.setMaxLossWithdrawParam(maxLoss);

        expect(await strategy.maxLossWithdrawParam()).to.eq('10000');
      });

      it("uses the maxLossWithdrawParam when calling 'withdraw' on Yearn vault", async () => {
        const maxLoss = '100'; // 1%
        await strategy.setMaxLossWithdrawParam(maxLoss);

        underlying.mint(strategy.address, parseUnits('100'));
        strategy.connect(manager).invest();

        await strategy.connect(manager).withdrawToVault(parseUnits('30'));

        expect(await yVault.maxLossWithdrawParam()).to.eq(maxLoss);
      });
    });
  });
});

const beforeEachCommon = async (underlyingDecimals: string) => {
  [owner, manager] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory('MockERC20');
  underlying = await MockERC20.deploy(
    'LUSD',
    'LUSD',
    underlyingDecimals,
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

  await underlying.connect(owner).approve(vault.address, constants.MaxUint256);
};
