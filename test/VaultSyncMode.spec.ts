import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { BigNumber } from 'ethers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';

import {
  Vault,
  MockUST__factory,
  MockUST,
  MockSyncStrategy,
} from '../typechain';

import { depositParams, claimParams } from './shared/factories';
import createVaultHelpers from './shared/vault';

import { moveForwardTwoWeeks, generateNewAddress } from './shared';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('Vault in sync mode', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let underlying: MockUST;
  let vault: Vault;
  let strategy: MockSyncStrategy;

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

    const ustDeployment = await deployments.get('UST');

    underlying = MockUST__factory.connect(ustDeployment.address, owner);
  });

  beforeEach(() => fixtures());

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    let Vault = await ethers.getContractFactory('Vault');
    let MockStrategy = await ethers.getContractFactory('MockSyncStrategy');

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
    underlying.connect(carol).approve(vault.address, MaxUint256);

    strategy = await MockStrategy.deploy(vault.address, underlying.address);

    await vault.connect(owner).setStrategy(strategy.address);

    ({ addUnderlyingBalance, addYieldToVault } = createVaultHelpers({
      vault,
      underlying,
    }));

    await addUnderlyingBalance(alice, '1000');
    await addUnderlyingBalance(bob, '1000');
    await addUnderlyingBalance(carol, '1000');
  });

  describe('#claimYield when there are not enough funds in the vault', () => {
    it('claims the yield from the strategy', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('949'),
      );
    });

    it('claims part of the yield from the strategy', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('40');
      await vault.connect(owner).updateInvested();
      await addYieldToVault('10');

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('949'),
      );
    });

    it("rebalances the Vault's reserves when yield > reserves", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlying.balanceOf(vault.address)).to.eq(
        (101e17).toString(),
      );
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        (909e17).toString(),
      );
    });

    it("doesn't rebalance the Vault's reserves when yield = reserves", async () => {
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

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlying.balanceOf(vault.address)).to.eq('0');
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('135'),
      );
    });

    it("doesn't rebalance the Vault's reserves when yield < reserves", async () => {
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

      await vault.connect(alice).claimYield(alice.address);

      // vault had 115 before the claim, and 49 was claimed, so it should have 115 - 49 = 66
      expect(await underlying.balanceOf(vault.address)).to.eq(parseUnits('66'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('135'),
      );
    });
  });

  describe('#withdraw when there are not enough funds in the vault', () => {
    it('withdraws the amount from the strategy', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [1]);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        '999999999999999999999',
      );
    });

    it('withdraws part of the amount from the strategy', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('30');
      await vault.connect(owner).updateInvested();
      await addYieldToVault('20');

      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [1]);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        '999999999999999999999',
      );
    });

    it("rebalances the Vault's reserves when withdraw amount > reserves", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [1]);

      expect(await underlying.balanceOf(vault.address)).to.eq(parseUnits('5'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        '45000000000000000001',
      );
    });

    it("doesn't rebalance the Vault's reserves when withdraw amount = reserves", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      // bob's deposit is exactly enough to cover alice's withdrawal and leave the valut with ~0 balance
      const bobsDeposit = depositParams.build({
        amount: parseUnits('85'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });
      await vault.connect(bob).deposit(bobsDeposit);

      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [1]);

      expect(await underlying.balanceOf(vault.address)).to.eq('1');
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('135'),
      );
    });

    it("doesn't rebalance the Vault's reserves when withdraw amount < reserves", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      // bob's deposit is more than enough to cover alice's withdrawal
      const bobsDeposit = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });
      await vault.connect(bob).deposit(bobsDeposit);

      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [1]);

      // vault had 115 before the withdrawal, and 100 was withdrawn, so it should have 115 - 100 = 15
      expect(await underlying.balanceOf(vault.address)).to.eq(
        '15000000000000000001'.toString(),
      );
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('135'),
      );
    });
  });

  describe('#partialWithdraw when there are not enough funds in the vault', () => {
    it('withdraws the amount from the strategy', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      await moveForwardTwoWeeks();
      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('50')]);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        '949999999999999999999',
      );
    });

    it('withdraws part of the amount from the strategy', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('30');
      await vault.connect(owner).updateInvested();
      await addYieldToVault('20');

      await moveForwardTwoWeeks();
      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('50')]);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        '949999999999999999999',
      );
    });

    it("rebalances the Vault's reserves when withdraw amount > reserves", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      await moveForwardTwoWeeks();
      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('50')]);

      expect(await underlying.balanceOf(vault.address)).to.eq(parseUnits('10'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        '90000000000000000001',
      );
    });

    it("doesn't rebalance the Vault's reserves when withdraw amount = reserves", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      // bob's deposit is exactly enough to cover alice's withdrawal and leave the valut with ~0 balance
      const bobsDeposit = depositParams.build({
        amount: parseUnits('35'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });
      await vault.connect(bob).deposit(bobsDeposit);

      await moveForwardTwoWeeks();
      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('50')]);

      expect(await underlying.balanceOf(vault.address)).to.eq('1');
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('135'),
      );
    });

    it("doesn't rebalance the Vault's reserves when withdraw amount < reserves", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });
      await vault.connect(alice).deposit(params);

      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      // bob's deposit is more than enough to cover alice's withdrawal
      const bobsDeposit = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });
      await vault.connect(bob).deposit(bobsDeposit);

      await moveForwardTwoWeeks();
      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('50')]);

      // vault had 115 before the withdrawal, and 50 was withdrawn, so it should have 115 - 50 = 65
      expect(await underlying.balanceOf(vault.address)).to.eq(
        '65000000000000000001'.toString(),
      );
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits('135'),
      );
    });
  });
});
