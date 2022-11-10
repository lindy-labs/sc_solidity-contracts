import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';
import { Contract, BigNumber } from 'ethers';

import {
  Vault,
  Vault__factory,
  MockStrategySync,
  MockLUSD,
  MockLUSD__factory,
} from '../typechain';

import createVaultHelpers from './shared/vault';
import { depositParams, claimParams } from './shared/factories';
import {
  moveForwardTwoWeeks,
  SHARES_MULTIPLIER,
  generateNewAddress,
  CURVE_SLIPPAGE,
} from './shared';

const { utils } = ethers;
const { parseUnits } = ethers.utils;
const BN = ethers.BigNumber;
const { MaxUint256 } = ethers.constants;

describe('Integration', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let underlying: MockLUSD;
  let vault: Vault;
  let strategy: MockStrategySync;

  let addUnderlyingBalance: (
    account: SignerWithAddress,
    amount: string,
  ) => Promise<void>;
  let addYieldToVault: (amount: string) => Promise<BigNumber>;
  let removeUnderlyingFromVault: (amount: string) => Promise<void>;

  const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('00');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');
  const INVEST_PCT = BigNumber.from('9000');
  const SPONSOR_ROLE = utils.keccak256(utils.toUtf8Bytes('SPONSOR_ROLE'));

  const fixtures = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture(['vault']);

    [owner] = await ethers.getSigners();

    const lusdDeployment = await deployments.get('LUSD');
    const lusdVaultDeployment = await deployments.get('Vault_LUSD');

    underlying = MockLUSD__factory.connect(lusdDeployment.address, owner);
    vault = Vault__factory.connect(lusdVaultDeployment.address, owner);
  });

  beforeEach(() => fixtures());

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    let Vault = await ethers.getContractFactory('Vault');
    let MockStrategy = await ethers.getContractFactory('MockStrategySync');

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

    strategy = await MockStrategy.deploy(
      vault.address,
      underlying.address,
      owner.address,
    );

    ({ addUnderlyingBalance, addYieldToVault, removeUnderlyingFromVault } =
      createVaultHelpers({
        vault,
        underlying,
      }));
  });

  describe('single deposit, single sponsor and single claimer', () => {
    it('ensures everyone gets their expected amounts', async () => {
      await addUnderlyingBalance(alice, '1000');
      await addUnderlyingBalance(bob, '1000');
      await vault.connect(owner).grantRole(SPONSOR_ROLE, bob.address);

      await vault
        .connect(bob)
        .sponsor(
          underlying.address,
          parseUnits('500'),
          TWO_WEEKS,
          CURVE_SLIPPAGE,
        );

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('500'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await addYieldToVault('2000');
      await moveForwardTwoWeeks();

      await vault.connect(carol).claimYield(carol.address);
      await vault.connect(alice).withdraw(alice.address, [2]);
      await vault.connect(bob).unsponsor(bob.address, [1]);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1000'));
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('1000'),
      );
      expect(await underlying.balanceOf(carol.address)).to.eq(
        parseUnits('2000'),
      );
    });

    it('ensures the sponsored amount is protected when the vault is underperforming', async () => {
      await addUnderlyingBalance(alice, '1000');
      await addUnderlyingBalance(bob, '1000');
      await vault.connect(owner).grantRole(SPONSOR_ROLE, bob.address);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1000'));
      await vault
        .connect(bob)
        .sponsor(
          underlying.address,
          parseUnits('500'),
          TWO_WEEKS,
          CURVE_SLIPPAGE,
        );

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('500'));

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('500'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await addYieldToVault('2000');
      await moveForwardTwoWeeks();
      await removeUnderlyingFromVault('2500');

      await expect(
        vault.connect(carol).claimYield(carol.address),
      ).to.be.revertedWith('VaultNoYieldToClaim');
      // we expect the withdraw to fail because there are not enough funds in the vault
      await expect(
        vault.connect(alice).withdraw(alice.address, [2]),
      ).to.be.revertedWith('VaultCannotWithdrawWhenYieldNegative');
      await vault.connect(bob).unsponsor(bob.address, [1]);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1000'));
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('500'),
      );
      expect(await underlying.balanceOf(carol.address)).to.eq(parseUnits('0'));
    });

    it('ensures the sponsored amount and the deposit are protected when the vault has no yield', async () => {
      await addUnderlyingBalance(alice, '1000');
      await addUnderlyingBalance(bob, '1000');
      await vault.connect(owner).grantRole(SPONSOR_ROLE, bob.address);

      await vault
        .connect(bob)
        .sponsor(
          underlying.address,
          parseUnits('500'),
          TWO_WEEKS,
          CURVE_SLIPPAGE,
        );

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('500'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await moveForwardTwoWeeks();

      await expect(
        vault.connect(carol).claimYield(carol.address),
      ).to.be.revertedWith('VaultNoYieldToClaim');
      await vault.connect(alice).withdraw(alice.address, [2]);
      await vault.connect(bob).unsponsor(bob.address, [1]);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1000'));
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('1000'),
      );
      expect(await underlying.balanceOf(carol.address)).to.eq(parseUnits('0'));
    });
  });

  describe('single deposit, two sponsors and two claimers', () => {
    it("ensures the sponsored amount is divided according to their proportion of each claimer's shares", async () => {
      await addUnderlyingBalance(alice, '1500');
      await addUnderlyingBalance(bob, '1000');
      await vault.connect(owner).grantRole(SPONSOR_ROLE, alice.address);
      await vault.connect(owner).grantRole(SPONSOR_ROLE, bob.address);

      // alice and bob sponsor
      await vault
        .connect(alice)
        .sponsor(
          underlying.address,
          parseUnits('500'),
          TWO_WEEKS,
          CURVE_SLIPPAGE,
        );
      await vault
        .connect(bob)
        .sponsor(
          underlying.address,
          parseUnits('500'),
          TWO_WEEKS,
          CURVE_SLIPPAGE,
        );

      // alice deposits with yield to herself and to carol
      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('1000'),
          inputToken: underlying.address,
          claims: [
            claimParams.percent(50).to(alice.address).build(),
            claimParams.percent(50).to(carol.address).build(),
          ],
        }),
      );

      // the vault generates yield
      await addYieldToVault('1000');
      await moveForwardTwoWeeks();

      // alice claims her share
      await vault.connect(alice).claimYield(alice.address);
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('500'),
      );

      // the vault generates yield
      await addYieldToVault('1500');

      // alice withdraws the deposit
      await vault.connect(alice).withdraw(alice.address, [3, 4]);
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('1500'),
      );

      // alice and bob unsponsor
      await vault.connect(alice).unsponsor(alice.address, [1]);
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('2000'),
      );

      await vault.connect(bob).unsponsor(bob.address, [2]);
      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1000'));

      // the vault generates yield
      await addYieldToVault('2000');

      // alice and carol claim the remaning yield
      await vault.connect(alice).claimYield(alice.address);
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('3000'),
      );

      await vault.connect(carol).claimYield(carol.address);
      expect(await underlying.balanceOf(carol.address)).to.eq(
        parseUnits('3000'),
      );
    });
  });

  describe('single deposit, single claimer', () => {
    it('creates a deposit and updates the claimer', async () => {
      await addUnderlyingBalance(alice, '1000');
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      await vault.connect(alice).deposit(params);

      const deposit = await vault.deposits(1);
      expect(deposit.owner).to.equal(alice.address);
      expect(deposit.amount).to.equal(parseUnits('100'));
      expect(deposit.claimerId).to.equal(bob.address);

      expect(await vault.totalShares()).to.equal(
        parseUnits('100').mul(SHARES_MULTIPLIER),
      );

      expect(await vault.principalOf(bob.address)).to.equal(parseUnits('100'));
    });
  });

  describe('single deposit, multiple claimers', () => {
    it('creates two deposit and updates the claimers', async () => {
      await addUnderlyingBalance(alice, '1000');
      const amount = BN.from('100');
      const params = depositParams.build({
        amount,
        inputToken: underlying.address,
        claims: [
          claimParams.percent(25).to(bob.address).build(),
          claimParams.percent(75).to(carol.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);

      const deposit = await vault.deposits(1);
      expect(deposit.owner).to.equal(alice.address);
      const part0 = await vault.deposits(1);
      expect(part0.amount).to.equal(amount.div('4'));
      expect(part0.claimerId).to.equal(bob.address);

      const part1 = await vault.deposits(2);
      expect(part1.amount).to.equal(amount.div('4').mul('3'));
      expect(part1.claimerId).to.equal(carol.address);

      expect(await vault.totalShares()).to.equal(
        BigNumber.from('100').mul(SHARES_MULTIPLIER),
      );

      expect(await vault.principalOf(bob.address)).to.equal(25);

      expect(await vault.principalOf(carol.address)).to.equal(75);
    });

    it('allows claiming the yield after the principal is withdrawn', async () => {
      await addUnderlyingBalance(alice, '1000');
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(bob.address).build(),
          claimParams.percent(50).to(carol.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);

      await addYieldToVault('100');
      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [2, 1]);
      await addYieldToVault('100');
      await vault.connect(carol).claimYield(carol.address);
      await vault.connect(bob).claimYield(bob.address);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('100'));
      expect(await underlying.balanceOf(carol.address)).to.eq(
        parseUnits('100'),
      );
    });

    it('allows the yield to value after the principal is claiemd', async () => {
      await addUnderlyingBalance(alice, '1000');
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(bob.address).build(),
          claimParams.percent(50).to(carol.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault('100');
      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [1]);
      await addYieldToVault('150');
      await vault.connect(carol).claimYield(carol.address);
      await vault.connect(bob).claimYield(bob.address);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('100'));
      expect(await underlying.balanceOf(carol.address)).to.eq(
        parseUnits('150'),
      );
    });
  });

  describe("when there's loss", () => {
    it("allows for an initial loss caused by the strategy's fees", async () => {
      await vault.setStrategy(strategy.address);
      await addUnderlyingBalance(alice, '100');
      await addUnderlyingBalance(bob, '100');

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await removeUnderlyingFromVault('2');

      await vault.connect(bob).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await moveForwardTwoWeeks();

      await vault.connect(alice).forceWithdraw(alice.address, [1]);
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('99').sub(1),
      );

      await vault.connect(bob).forceWithdraw(bob.address, [2]);
      expect(await underlying.balanceOf(bob.address)).to.eq(
        parseUnits('99').add(1),
      );
    });

    it('it distributes the loss evenly when sending yield to the same person', async () => {
      await addUnderlyingBalance(alice, '1000');
      await addUnderlyingBalance(bob, '2000');

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('1000'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await vault.connect(bob).deposit(
        depositParams.build({
          amount: parseUnits('2000'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await removeUnderlyingFromVault('1500');
      await moveForwardTwoWeeks();

      await vault.connect(alice).forceWithdraw(alice.address, [1]);
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('500'),
      );

      await vault.connect(bob).forceWithdraw(bob.address, [2]);
      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1000'));
    });

    it('it distributes the loss evenly when sending yield to different people', async () => {
      await addUnderlyingBalance(alice, '1000');
      await addUnderlyingBalance(bob, '2000');

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('1000'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(alice.address).build()],
        }),
      );

      await vault.connect(bob).deposit(
        depositParams.build({
          amount: parseUnits('2000'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await removeUnderlyingFromVault('1500');
      await moveForwardTwoWeeks();

      await vault.connect(alice).forceWithdraw(alice.address, [1]);
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('500'),
      );

      await vault.connect(bob).forceWithdraw(bob.address, [2]);
      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1000'));
    });

    it('takes unclaimed yield into account when distributing loss', async () => {
      await addUnderlyingBalance(alice, '1000');
      await addUnderlyingBalance(bob, '2000');

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('1000'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(alice.address).build()],
        }),
      );

      await vault.connect(bob).deposit(
        depositParams.build({
          amount: parseUnits('2000'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await moveForwardTwoWeeks();

      await addYieldToVault('3000');

      await vault.connect(carol).claimYield(carol.address);
      expect(await underlying.balanceOf(carol.address)).to.eq(
        parseUnits('2000'),
      );

      await removeUnderlyingFromVault('3000');
      expect(await underlying.balanceOf(vault.address)).to.eq(
        parseUnits('1000'),
      );

      await vault.connect(alice).forceWithdraw(alice.address, [1]);
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('500'),
      );

      await vault.connect(bob).forceWithdraw(bob.address, [2]);
      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('500'));
    });
  });

  describe('two deposits, two claimers', () => {
    it('withdraws only one of the deposits', async () => {
      await addUnderlyingBalance(alice, '1000');

      await vault.connect(alice).deposit(
        depositParams.build({
          lockDuration: BigNumber.from(time.duration.days(20).toNumber()),
          inputToken: underlying.address,
          amount: parseUnits('100'),
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [
            claimParams.percent(75).to(carol.address).build(),
            claimParams.percent(25).to(bob.address).build(),
          ],
        }),
      );

      await moveForwardTwoWeeks();
      await vault.connect(alice).withdraw(alice.address, [2]);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('875'),
      );
    });

    it('allows withdraws at different times', async () => {
      await addUnderlyingBalance(alice, '1000');

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await addYieldToVault('100');

      await vault.connect(carol).claimYield(carol.address);

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [
            claimParams.percent(50).to(carol.address).build(),
            claimParams.percent(50).to(bob.address).build(),
          ],
        }),
      );

      await addYieldToVault('200');

      await vault.connect(carol).claimYield(carol.address);
      await vault.connect(bob).claimYield(bob.address);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('50'));
      expect(await underlying.balanceOf(carol.address)).to.eq(
        parseUnits('250'),
      );
    });

    it('compounds the yield of the first deposit', async () => {
      await addUnderlyingBalance(alice, '1000');

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      await addYieldToVault('100');

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [
            claimParams.percent(50).to(carol.address).build(),
            claimParams.percent(50).to(bob.address).build(),
          ],
        }),
      );

      await addYieldToVault('300');

      await vault.connect(carol).claimYield(carol.address);
      await vault.connect(bob).claimYield(bob.address);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('50'));
      expect(await underlying.balanceOf(carol.address)).to.eq(
        parseUnits('350'),
      );
    });
  });

  describe('multiple depositors, multiple partial withdrawals, multiple claimers', () => {
    it('allows for multiple partial withdrawals for the same deposit', async () => {
      await addUnderlyingBalance(alice, '1000');
      await addUnderlyingBalance(bob, '1000');

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(alice.address).build()],
        }),
      );

      await vault.connect(bob).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(alice.address).build()],
        }),
      );

      await moveForwardTwoWeeks();

      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('25')]);

      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('25')]);

      await vault
        .connect(bob)
        .partialWithdraw(alice.address, [2], [parseUnits('50')]);

      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('50')]);

      await vault
        .connect(bob)
        .partialWithdraw(alice.address, [2], [parseUnits('50')]);

      expect(await vault.totalPrincipal()).to.eq(0);
      expect(await underlying.balanceOf(vault.address)).to.eq(0);
      expect(await vault.totalShares()).to.eq(0);
      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('1100'),
      );
      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('900'));
    });

    it('allows for claiming yield after a partial withdraw', async () => {
      await addUnderlyingBalance(alice, '1000');
      await addUnderlyingBalance(bob, '1000');

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(alice.address).build()],
        }),
      );

      await vault.connect(bob).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(bob.address).build()],
        }),
      );

      await moveForwardTwoWeeks();
      await addYieldToVault('200');

      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('25')]);

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('1025'),
      );

      await vault
        .connect(bob)
        .partialWithdraw(bob.address, [2], [parseUnits('50')]);

      await vault.connect(bob).claimYield(bob.address);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1050'));

      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('75')]);

      await vault
        .connect(bob)
        .partialWithdraw(bob.address, [2], [parseUnits('50')]);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('1100'),
      );
      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1100'));
    });

    it('allows for loss scenarios', async () => {
      await addUnderlyingBalance(alice, '1000');
      await addUnderlyingBalance(bob, '1000');

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(alice.address).build()],
        }),
      );

      await vault.connect(bob).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(bob.address).build()],
        }),
      );

      await moveForwardTwoWeeks();
      await addYieldToVault('200');

      // alice claims
      await vault.connect(alice).claimYield(alice.address);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('1000'),
      );

      // bob claims and partial withraws
      await vault
        .connect(bob)
        .partialWithdraw(bob.address, [2], [parseUnits('50')]);

      await vault.connect(bob).claimYield(bob.address);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1050'));

      // there's loss
      await removeUnderlyingFromVault('15');
      expect(await underlying.balanceOf(vault.address)).to.eq(
        parseUnits('135'),
      );

      // bob force withdraws with a loss of 5
      await vault.connect(bob).forceWithdraw(bob.address, [2]);
      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('1095'));

      // there's yiled
      await addYieldToVault('10');

      // alice partial withdraws
      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('40')]);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('1040'),
      );

      // alice withdraws
      await vault.connect(alice).withdraw(alice.address, [1]);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('1100'),
      );
    });
  });
});
