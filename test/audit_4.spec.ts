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
} from '../typechain';

import { generateNewAddress } from './shared/';
import { parseUnits } from 'ethers/lib/utils';

describe('Audit Tests 4', () => {
  describe('issue H-1', () => {
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

    const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

    beforeEach(async () => {
      [owner, manager] = await ethers.getSigners();

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

      it("always calls Yearn vault 'withdraw' function with param 'maxLoss' = 1", async () => {
        underlying.mint(strategy.address, parseUnits('100'));
        strategy.connect(manager).invest();

        await strategy.connect(manager).withdrawToVault(parseUnits('30'));

        expect(await yVault.maxLossWithdrawParam()).to.eq('1');
      });
    });
  });
});
