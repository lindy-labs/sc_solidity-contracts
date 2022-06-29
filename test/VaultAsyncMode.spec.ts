import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { BigNumber } from 'ethers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';

import {
  Vault,
  MockStrategyAsync,
  MockLUSD,
  MockLUSD__factory,
} from '../typechain';

import { depositParams, claimParams } from './shared/factories';
import createVaultHelpers from './shared/vault';

import { moveForwardTwoWeeks, generateNewAddress } from './shared';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('Vault in async mode', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let underlying: MockLUSD;
  let vault: Vault;
  let strategy: MockStrategyAsync;

  let addUnderlyingBalance: (
    account: SignerWithAddress,
    amount: string,
  ) => Promise<BigNumber>;
  let addYieldToVault: (amount: string) => Promise<BigNumber>;

  const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());

  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('200');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');
  const INVEST_PCT = BigNumber.from('9000');

  const fixtures = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture(['vaults']);

    [owner] = await ethers.getSigners();

    const lusdDeployment = await deployments.get('LUSD');

    underlying = MockLUSD__factory.connect(lusdDeployment.address, owner);
  });

  beforeEach(() => fixtures());

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    let Vault = await ethers.getContractFactory('Vault');
    let MockStrategy = await ethers.getContractFactory('MockStrategyAsync');

    vault = await Vault.deploy(
      underlying.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      owner.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    underlying.connect(owner).approve(vault.address, MaxUint256);
    underlying.connect(alice).approve(vault.address, MaxUint256);
    underlying.connect(bob).approve(vault.address, MaxUint256);

    strategy = await MockStrategy.deploy(vault.address, underlying.address);

    await vault.connect(owner).setStrategy(strategy.address);

    ({ addUnderlyingBalance, addYieldToVault } = createVaultHelpers({
      vault,
      underlying,
    }));

    await addUnderlyingBalance(alice, '1000');
    await addUnderlyingBalance(bob, '1000');
  });

  describe("#claimYield doesn't rebalance the Vault's funds", () => {
    it('reverts when yield > reserves', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      await expect(
        vault.connect(alice).claimYield(alice.address),
      ).to.be.revertedWith('VaultNotEnoughFunds');
    });

    it('works when yield = reserves', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      // bob's deposit is exactly enough to cover alice's claim and leave valut with 0 balance
      const bobsDeposit = depositParams.build({
        amount: parseUnits('34'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });
      await vault.connect(bob).deposit(bobsDeposit);

      await expect(vault.connect(alice).claimYield(alice.address)).to.not.be
        .reverted;

      expect(await underlying.balanceOf(vault.address)).to.eq('0');
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('135'),
      );
    });

    it('works when yield < reserves', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      // bob's deposit is more than enough to cover alice's claim
      const bobsDeposit = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });
      await vault.connect(bob).deposit(bobsDeposit);

      await expect(vault.connect(alice).claimYield(alice.address)).to.not.be
        .reverted;

      // vault had 115 before the claim, and 49 was claimed, so it should have 115 - 49 = 66
      expect(await underlying.balanceOf(vault.address)).to.eq(parseUnits('66'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('135'),
      );
    });
  });

  describe("#withdraw doesn't rebalance the Vault's funds", () => {
    it('reverts when amount > reserves', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);
      await vault.connect(owner).updateInvested();

      await moveForwardTwoWeeks();
      await expect(
        vault.connect(alice).withdraw(alice.address, [1]),
      ).to.be.revertedWith('VaultNotEnoughFunds');
    });

    it('works when amount = reserves', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);
      await vault.connect(owner).updateInvested();

      // bob's deposit is exactly enough to cover alice's withdrawal and leave the valut with 0 balance
      const bobsDeposit = depositParams.build({
        amount: parseUnits('90'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });
      await vault.connect(bob).deposit(bobsDeposit);

      await moveForwardTwoWeeks();

      await expect(vault.connect(alice).withdraw(alice.address, [1])).to.not.be
        .reverted;

      expect(await underlying.balanceOf(vault.address)).to.eq('0');
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('90'),
      );
    });

    it('works when amount < reserves', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);
      await vault.connect(owner).updateInvested();

      // bob's deposit is more than enough to cover alice's withdrawal
      const bobsDeposit = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });
      await vault.connect(bob).deposit(bobsDeposit);

      await moveForwardTwoWeeks();

      await expect(vault.connect(alice).withdraw(alice.address, [1])).to.not.be
        .reverted;

      // vault had 110 before the withdrawal, and 100 was withdrawn, so it should have 110 - 100 = 10
      expect(await underlying.balanceOf(vault.address)).to.eq(parseUnits('10'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('90'),
      );
    });
  });

  describe("#partialWithdraw doesn't rebalance the Vault's funds", () => {
    it('reverts when amount > reserves', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);
      await vault.connect(owner).updateInvested();

      await moveForwardTwoWeeks();

      await expect(
        vault
          .connect(alice)
          .partialWithdraw(alice.address, [1], [parseUnits('50')]),
      ).to.be.revertedWith('VaultNotEnoughFunds');
    });

    it('works when amount = reserves', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);
      await vault.connect(owner).updateInvested();

      // bob's deposit is exactly enough to cover alice's withdrawal and leave the valut with 0 balance
      const bobsDeposit = depositParams.build({
        amount: parseUnits('40'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });
      await vault.connect(bob).deposit(bobsDeposit);
      await moveForwardTwoWeeks();

      await expect(
        vault
          .connect(alice)
          .partialWithdraw(alice.address, [1], [parseUnits('50')]),
      ).to.not.be.reverted;

      expect(await underlying.balanceOf(vault.address)).to.eq('0');
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('90'),
      );
    });

    it('works when amount < reserves', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);
      await vault.connect(owner).updateInvested();

      // bob's deposit is more than enough to cover alice's withdrawal
      const bobsDeposit = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });
      await vault.connect(bob).deposit(bobsDeposit);
      await moveForwardTwoWeeks();

      await expect(
        vault
          .connect(alice)
          .partialWithdraw(alice.address, [1], [parseUnits('50')]),
      ).to.not.be.reverted;

      // vault had 110 before the withdrawal, and 50 was withdrawn, so it should have 110 - 50 = 60
      expect(await underlying.balanceOf(vault.address)).to.eq(parseUnits('60'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('90'),
      );
    });
  });
});
