import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { Contract, utils, BigNumber, constants, Signer } from 'ethers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';

import {
  Vault,
  MockUST__factory,
  MockAUST__factory,
  MockUST,
  MockAUST,
  MockStrategy,
  Vault__factory,
} from '../typechain';

import { depositParams, claimParams } from './shared/factories';
import {
  getLastBlockTimestamp,
  moveForwardTwoWeeks,
  SHARES_MULTIPLIER,
  generateNewAddress,
  getRoleErrorMsg,
  arrayFromTo,
} from './shared';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('Vault', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let newAccount: SignerWithAddress;

  let mockEthAnchorRouter: Contract;
  let mockAUstUstFeed: Contract;

  let underlying: MockUST;
  let aUstToken: MockAUST;
  let vault: Vault;
  let strategy: MockStrategy;
  const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());
  const MAX_DEPOSIT_LOCK_DURATION = BigNumber.from(
    time.duration.weeks(24).toNumber(),
  );
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('200');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');
  const INVEST_PCT = BigNumber.from('9000');
  const DENOMINATOR = BigNumber.from('10000');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const INVESTOR_ROLE = utils.keccak256(utils.toUtf8Bytes('INVESTOR_ROLE'));
  const SETTINGS_ROLE = utils.keccak256(utils.toUtf8Bytes('SETTINGS_ROLE'));
  const SPONSOR_ROLE = utils.keccak256(utils.toUtf8Bytes('SPONSOR_ROLE'));

  const fixtures = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture(['vaults']);

    [owner, alice, bob, carol] = await ethers.getSigners();

    const ustDeployment = await deployments.get('UST');
    const austDeployment = await deployments.get('aUST');
    const ustVaultDeployment = await deployments.get('Vault_UST');

    aUstToken = MockAUST__factory.connect(austDeployment.address, owner);
    underlying = MockUST__factory.connect(ustDeployment.address, owner);
    vault = Vault__factory.connect(ustVaultDeployment.address, owner);

    await addUnderlyingBalance(alice, '1000');
    await addUnderlyingBalance(bob, '1000');
    await addUnderlyingBalance(carol, '1000');
  });

  beforeEach(() => fixtures());

  beforeEach(async () => {
    [owner, alice, bob, carol, newAccount] = await ethers.getSigners();

    let Vault = await ethers.getContractFactory('Vault');
    let MockStrategy = await ethers.getContractFactory('MockStrategy');

    const MockEthAnchorRouterFactory = await ethers.getContractFactory(
      'MockEthAnchorRouter',
    );
    mockEthAnchorRouter = await MockEthAnchorRouterFactory.deploy(
      underlying.address,
      aUstToken.address,
    );

    const MockChainlinkPriceFeedFactory = await ethers.getContractFactory(
      'MockChainlinkPriceFeed',
    );
    mockAUstUstFeed = await MockChainlinkPriceFeedFactory.deploy(18);

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
      mockEthAnchorRouter.address,
      mockAUstUstFeed.address,
      underlying.address,
      aUstToken.address,
    );
  });

  describe('codearena', () => {
    describe('issue #125', () => {
      beforeEach(async () => {
        await vault.connect(alice).deposit(
          depositParams.build({
            amount: parseUnits('1000'),
            inputToken: underlying.address,
            claims: arrayFromTo(1, 100).map(() =>
              claimParams.percent(1).to(bob.address).build(),
            ),
          }),
        );

        await moveForwardTwoWeeks();
      });

      it('works with a single withdraw', async () => {
        await vault.connect(alice).withdraw(alice.address, arrayFromTo(1, 99));

        expect(await underlying.balanceOf(alice.address)).to.eq(
          parseUnits('990'),
        );

        expect(await vault.sharesOf(bob.address)).to.eq(
          parseUnits('10').mul(SHARES_MULTIPLIER),
        );
      });

      it('works with multiple withdraws', async () => {
        await Promise.all(
          arrayFromTo(1, 99).map((i) =>
            vault.connect(alice).withdraw(alice.address, [i]),
          ),
        );

        expect(await underlying.balanceOf(alice.address)).to.eq(
          parseUnits('990'),
        );
        expect(await vault.sharesOf(bob.address)).to.eq(
          parseUnits('10').mul(SHARES_MULTIPLIER),
        );
      });
    });

    describe('issue #52', () => {
      it('works with irregular amounts without losing precision', async () => {
        await addUnderlyingBalance(alice, '1000');

        await vault.connect(alice).deposit(
          depositParams.build({
            amount: 11,
            inputToken: underlying.address,
            claims: [
              claimParams.percent(50).to(alice.address).build(),
              claimParams.percent(50).to(bob.address).build(),
            ],
          }),
        );

        expect((await vault.deposits(1)).amount).to.equal(5);
        expect((await vault.deposits(2)).amount).to.equal(6);
      });
    });
  });

  describe('constructor', () => {
    let VaultFactory: Vault__factory;

    beforeEach(async () => {
      VaultFactory = await ethers.getContractFactory('Vault');
    });

    it('reverts if underlying is address(0)', async () => {
      await expect(
        VaultFactory.deploy(
          constants.AddressZero,
          TWO_WEEKS,
          INVEST_PCT,
          TREASURY,
          owner.address,
          PERFORMANCE_FEE_PCT,
          INVESTMENT_FEE_PCT,
          [],
        ),
      ).to.be.revertedWith('VaultUnderlyingCannotBe0Address');
    });

    it('reverts if min lock period is zero', async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          0,
          INVEST_PCT,
          TREASURY,
          owner.address,
          PERFORMANCE_FEE_PCT,
          INVESTMENT_FEE_PCT,
          [],
        ),
      ).to.be.revertedWith('VaultInvalidMinLockPeriod');
    });

    it('reverts if min lock period is greater than maximum', async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          MAX_DEPOSIT_LOCK_DURATION.add(BigNumber.from('1')),
          INVEST_PCT,
          TREASURY,
          owner.address,
          PERFORMANCE_FEE_PCT,
          INVESTMENT_FEE_PCT,
          [],
        ),
      ).to.be.revertedWith('VaultInvalidMinLockPeriod');
    });

    it('reverts if invest percentage is greater than 100%', async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          TWO_WEEKS,
          DENOMINATOR.add(BigNumber.from('1')),
          TREASURY,
          owner.address,
          PERFORMANCE_FEE_PCT,
          INVESTMENT_FEE_PCT,
          [],
        ),
      ).to.be.revertedWith('VaultInvalidInvestpct');
    });

    it('reverts if performance fee percentage is greater than 100%', async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          TWO_WEEKS,
          INVEST_PCT,
          TREASURY,
          owner.address,
          DENOMINATOR.add(BigNumber.from('1')),
          INVESTMENT_FEE_PCT,
          [],
        ),
      ).to.be.revertedWith('VaultInvalidPerformanceFee');
    });

    it('reverts if treasury is address(0)', async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          TWO_WEEKS,
          INVEST_PCT,
          constants.AddressZero,
          owner.address,
          PERFORMANCE_FEE_PCT,
          INVESTMENT_FEE_PCT,
          [],
        ),
      ).to.be.revertedWith('VaultTreasuryCannotBe0Address');
    });

    it('reverts if owner is address(0)', async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          TWO_WEEKS,
          INVEST_PCT,
          TREASURY,
          constants.AddressZero,
          PERFORMANCE_FEE_PCT,
          INVESTMENT_FEE_PCT,
          [],
        ),
      ).to.be.revertedWith('VaultOwnerCannotBe0Address');
    });

    it('reverts if invalid investment fee', async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          TWO_WEEKS,
          INVEST_PCT,
          TREASURY,
          owner.address,
          PERFORMANCE_FEE_PCT,
          BigNumber.from('10001'),
          [],
        ),
      ).to.be.revertedWith('VaultInvalidLossTolerance');
    });

    it('Check initial values', async () => {
      expect(
        await vault.hasRole(DEFAULT_ADMIN_ROLE, owner.address),
      ).to.be.equal(true);
      expect(await vault.hasRole(INVESTOR_ROLE, owner.address)).to.be.equal(
        true,
      );
      expect(await vault.hasRole(SPONSOR_ROLE, owner.address)).to.be.equal(
        true,
      );

      expect(await vault.underlying()).to.be.equal(underlying.address);
      expect(await vault.minLockPeriod()).to.be.equal(TWO_WEEKS);
      expect(await vault.investPct()).to.be.equal(INVEST_PCT);
      expect(await vault.treasury()).to.be.equal(TREASURY);
      expect(await vault.perfFeePct()).to.be.equal(PERFORMANCE_FEE_PCT);
    });
  });

  describe('setTreasury', () => {
    it('reverts if msg.sender is not admin', async () => {
      await expect(
        vault.connect(alice).setTreasury(TREASURY),
      ).to.be.revertedWith(getRoleErrorMsg(alice, SETTINGS_ROLE));
    });

    it('reverts if treasury is address(0)', async () => {
      await expect(
        vault.connect(owner).setTreasury(constants.AddressZero),
      ).to.be.revertedWith('VaultTreasuryCannotBe0Address');
    });

    it('change treasury and emit TreasuryUpdated event', async () => {
      const newTreasury = generateNewAddress();
      const tx = await vault.connect(owner).setTreasury(newTreasury);

      await expect(tx).emit(vault, 'TreasuryUpdated').withArgs(newTreasury);
      expect(await vault.treasury()).to.be.equal(newTreasury);
    });
  });

  describe('setPerfFeePct', () => {
    it('reverts if msg.sender is not admin', async () => {
      await expect(vault.connect(alice).setPerfFeePct(100)).to.be.revertedWith(
        getRoleErrorMsg(alice, SETTINGS_ROLE),
      );
    });

    it('reverts if performance fee percentage is greater than 100%', async () => {
      await expect(
        vault
          .connect(owner)
          .setPerfFeePct(DENOMINATOR.add(BigNumber.from('1'))),
      ).to.be.revertedWith('VaultInvalidPerformanceFee');
    });

    it('change perfFeePct and emit PerfFeePctUpdated event', async () => {
      const newFeePct = 100;
      const tx = await vault.connect(owner).setPerfFeePct(newFeePct);

      await expect(tx).emit(vault, 'PerfFeePctUpdated').withArgs(newFeePct);
      expect(await vault.perfFeePct()).to.be.equal(newFeePct);
    });
  });

  describe('setInvestPct', () => {
    it('reverts if msg.sender is not admin', async () => {
      await expect(vault.connect(alice).setInvestPct(100)).to.be.revertedWith(
        getRoleErrorMsg(alice, SETTINGS_ROLE),
      );
    });

    it('reverts if invest percentage is greater than 100%', async () => {
      await expect(
        vault.connect(owner).setInvestPct(DENOMINATOR.add(BigNumber.from('1'))),
      ).to.be.revertedWith('VaultInvalidInvestpct');
    });

    it('change investPct and emit InvestPercentageUpdated event', async () => {
      const newInvestPct = 8000;
      const tx = await vault.connect(owner).setInvestPct(newInvestPct);

      await expect(tx).emit(vault, 'InvestPctUpdated').withArgs(newInvestPct);
      expect(await vault.investPct()).to.be.equal(newInvestPct);
    });
  });

  describe('setLossTolerancePct', () => {
    it('reverts if msg.sender is not admin', async () => {
      await expect(
        vault.connect(alice).setLossTolerancePct(100),
      ).to.be.revertedWith(getRoleErrorMsg(alice, SETTINGS_ROLE));
    });

    it('reverts if invest percentage is greater than 100%', async () => {
      await expect(
        vault
          .connect(owner)
          .setLossTolerancePct(DENOMINATOR.add(BigNumber.from('1'))),
      ).to.be.revertedWith('VaultInvalidLossTolerance');
    });

    it('change lossTolerancePct and emit InvestPercentageUpdated event', async () => {
      const newLossTolerancePct = 200;
      const tx = await vault
        .connect(owner)
        .setLossTolerancePct(newLossTolerancePct);

      await expect(tx)
        .emit(vault, 'LossTolerancePctUpdated')
        .withArgs(newLossTolerancePct);
      expect(await vault.lossTolerancePct()).to.be.equal(newLossTolerancePct);
    });
  });

  describe('totalUnderlying', () => {
    it('returns underlying balance if strategy is not set', async () => {
      expect(await vault.totalUnderlying()).to.be.equal(0);

      await underlying.mint(vault.address, parseUnits('100'));

      expect(await vault.totalUnderlying()).to.be.equal(parseUnits('100'));
    });

    it('returns underlying balance + strategy fund', async () => {
      await vault.connect(owner).setStrategy(strategy.address);

      await underlying.mint(vault.address, parseUnits('100'));
      await underlying.mint(strategy.address, parseUnits('50'));

      expect(await vault.totalUnderlying()).to.be.equal(parseUnits('150'));
    });
  });

  describe('withdrawPerformanceFee', () => {
    let perfFee: BigNumber;

    beforeEach(async () => {
      await addUnderlyingBalance(alice, '1000');

      const amount = parseUnits('100');
      const params = depositParams.build({
        amount,
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      await vault.connect(alice).deposit(params);
      const newYield = await addYieldToVault('100');
      await vault.connect(bob).claimYield(carol.address);
      perfFee = newYield.mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR);
    });

    it('reverts if msg.sender is not investor', async () => {
      await expect(
        vault.connect(alice).withdrawPerformanceFee(),
      ).to.be.revertedWith(getRoleErrorMsg(alice, INVESTOR_ROLE));
    });

    it('withdraw performance fee and emit FeeWithdrawn event', async () => {
      const tx = await vault.connect(owner).withdrawPerformanceFee();

      expect(await underlying.balanceOf(TREASURY)).to.be.equal(perfFee);
      await expect(tx).to.emit(vault, 'FeeWithdrawn').withArgs(perfFee);

      expect(await vault.accumulatedPerfFee()).to.be.eq('0');
    });

    it('reverts if nothing to withdraw', async () => {
      await vault.connect(owner).withdrawPerformanceFee();

      await expect(
        vault.connect(owner).withdrawPerformanceFee(),
      ).to.be.revertedWith('VaultNoPerformanceFee');
    });
  });

  describe('updateInvested', () => {
    it('reverts if msg.sender is not investor', async () => {
      await expect(vault.connect(alice).updateInvested()).to.be.revertedWith(
        getRoleErrorMsg(alice, INVESTOR_ROLE),
      );
    });

    it('reverts if strategy is not set', async () => {
      await expect(vault.connect(owner).updateInvested()).to.be.revertedWith(
        'VaultStrategyNotSet',
      );
    });

    it('reverts if no investable amount', async () => {
      await vault.connect(owner).setStrategy(strategy.address);

      await expect(vault.connect(owner).updateInvested()).to.be.revertedWith(
        'VaultNothingToDo',
      );
    });

    describe('invest scenario', () => {
      it('reverts if invest amount < 10 UST', async () => {
        await vault.connect(owner).setStrategy(strategy.address);
        await vault.connect(owner).setInvestPct('8000');
        await addYieldToVault('10');

        await expect(vault.connect(owner).updateInvested()).to.be.revertedWith(
          'VaultNotEnoughToRebalance',
        );
      });

      it('moves the funds to the strategy', async () => {
        await vault.connect(owner).setStrategy(strategy.address);
        await vault.connect(owner).setInvestPct('8000');
        await addYieldToVault('100');

        await vault.connect(owner).updateInvested();

        expect(await underlying.balanceOf(strategy.address)).to.eq(
          parseUnits('80'),
        );
      });

      it('emits an event', async () => {
        await vault.connect(owner).setStrategy(strategy.address);
        await vault.connect(owner).setInvestPct('8000');
        await addYieldToVault('100');

        const tx = await vault.connect(owner).updateInvested();

        await expect(tx).to.emit(vault, 'Invested').withArgs(parseUnits('80'));
      });
    });

    describe('disinvest scenario', () => {
      it('reverts if disinvest amount < 10 UST', async () => {
        await vault.connect(owner).setStrategy(strategy.address);
        await addYieldToVault('10');
        await underlying.mint(strategy.address, parseUnits('150'));

        await expect(vault.connect(owner).updateInvested()).to.be.revertedWith(
          'VaultNotEnoughToRebalance',
        );
      });

      it('call strategy.withdrawToVault with required amount', async () => {
        await vault.connect(owner).setStrategy(strategy.address);
        await addYieldToVault('10');
        await underlying.mint(strategy.address, parseUnits('190'));

        await vault.connect(owner).updateInvested();

        expect(await underlying.balanceOf(vault.address)).to.eq(
          parseUnits('20'),
        );
        expect(await underlying.balanceOf(strategy.address)).to.eq(
          parseUnits('180'),
        );
      });

      it('emits an event', async () => {
        await vault.connect(owner).setStrategy(strategy.address);
        await addYieldToVault('10');
        await underlying.mint(strategy.address, parseUnits('190'));

        const tx = await vault.connect(owner).updateInvested();

        await expect(tx)
          .to.emit(vault, 'Disinvested')
          .withArgs(parseUnits('10'));
      });
    });
  });

  describe('investState', () => {
    it('returns (0, 0) if strategy was not set', async () => {
      await addYieldToVault('100');

      const investState = await vault.investState();
      expect(investState.maxInvestableAmount).to.equal(0);
      expect(investState.alreadyInvested).to.equal(0);
    });

    it('returns maximum investable amount and 0 if nothing invested yet', async () => {
      await vault.connect(owner).setStrategy(strategy.address);
      await addYieldToVault('100');

      const investState = await vault.investState();
      expect(investState.maxInvestableAmount).to.equal(parseUnits('90'));
      expect(investState.alreadyInvested).to.equal(0);
    });

    it('returns maximum investable amount and already invested amount', async () => {
      await vault.connect(owner).setStrategy(strategy.address);
      await addYieldToVault('100');
      await underlying.mint(strategy.address, parseUnits('100'));

      const investState = await vault.investState();
      expect(investState.maxInvestableAmount).to.equal(parseUnits('180'));
      expect(investState.alreadyInvested).to.equal(parseUnits('100'));
    });

    it('returns the amount available to invest', async () => {
      await vault.connect(owner).setStrategy(strategy.address);
      await addYieldToVault('100');

      const { maxInvestableAmount, alreadyInvested } = await vault
        .connect(owner)
        .investState();

      const investAmount = maxInvestableAmount.sub(alreadyInvested);

      expect(investAmount).to.equal(parseUnits('90'));
    });

    it('takes into account the invested amount', async () => {
      await vault.connect(owner).setStrategy(strategy.address);
      await vault.connect(owner).setInvestPct('9000');
      await addYieldToVault('100');
      await underlying.mint(strategy.address, parseUnits('100'));

      const { maxInvestableAmount, alreadyInvested } = await vault
        .connect(owner)
        .investState();

      const investAmount = maxInvestableAmount.sub(alreadyInvested);

      expect(investAmount).to.equal(parseUnits('80'));
    });
  });

  describe('setStrategy', () => {
    it('reverts if msg.sender is not admin', async () => {
      await expect(
        vault.connect(alice).setStrategy(strategy.address),
      ).to.be.revertedWith(getRoleErrorMsg(alice, SETTINGS_ROLE));
    });

    it('reverts if new strategy is address(0)', async () => {
      await expect(
        vault.connect(owner).setStrategy(constants.AddressZero),
      ).to.be.revertedWith('VaultStrategyNotSet');
    });

    it("reverts if new strategy's vault is invalid", async () => {
      let Vault = await ethers.getContractFactory('Vault');

      const anotherVault = await Vault.deploy(
        aUstToken.address,
        TWO_WEEKS,
        INVEST_PCT,
        TREASURY,
        owner.address,
        PERFORMANCE_FEE_PCT,
        INVESTMENT_FEE_PCT,
        [],
      );

      await expect(
        anotherVault.connect(owner).setStrategy(strategy.address),
      ).to.be.revertedWith('VaultInvalidVault');
    });

    it('set strategy when no strategy was set before', async () => {
      expect(await vault.strategy()).to.equal(
        '0x0000000000000000000000000000000000000000',
      );

      await vault.connect(owner).setStrategy(strategy.address);

      expect(await vault.strategy()).to.equal(strategy.address);
    });

    it('emits an event', async () => {
      const tx = vault.connect(owner).setStrategy(strategy.address);

      await expect(tx)
        .to.emit(vault, 'StrategyUpdated')
        .withArgs(strategy.address);
    });

    it('set strategy if no asset invested even there is griefing attack', async () => {
      await vault.connect(owner).setStrategy(strategy.address);

      await aUstToken.mint(strategy.address, utils.parseEther('2'));
      await setAUstRate(utils.parseEther('1'));
      expect(await strategy.investedAssets()).to.not.eq('0');
      expect(await strategy.hasAssets()).to.equal(false);

      let MockStrategy = await ethers.getContractFactory('MockStrategy');

      const newStrategy = await MockStrategy.deploy(
        vault.address,
        mockEthAnchorRouter.address,
        mockAUstUstFeed.address,
        underlying.address,
        aUstToken.address,
      );

      const tx = await vault.connect(owner).setStrategy(newStrategy.address);

      await expect(tx)
        .to.emit(vault, 'StrategyUpdated')
        .withArgs(newStrategy.address);
    });

    it('reverts if strategy has invested funds', async () => {
      await vault.connect(owner).setStrategy(strategy.address);

      await strategy.setAllRedeemed(false); // This will force hasAssets function to return true;
      let MockStrategy = await ethers.getContractFactory('MockStrategy');

      const newStrategy = await MockStrategy.deploy(
        vault.address,
        mockEthAnchorRouter.address,
        mockAUstUstFeed.address,
        underlying.address,
        aUstToken.address,
      );

      await expect(
        vault.connect(owner).setStrategy(newStrategy.address),
      ).to.be.revertedWith('VaultStrategyHasInvestedFunds');
    });
  });

  describe('sponsor', () => {
    it('reverts if contract is paused', async () => {
      await vault.connect(owner).pause();
      await expect(
        vault
          .connect(owner)
          .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS),
      ).to.be.revertedWith('Pausable: paused');
      await vault.connect(owner).unpause();
    });
    it('reverts if msg.sender is not sponsor', async () => {
      await expect(
        vault
          .connect(alice)
          .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS),
      ).to.be.revertedWith(getRoleErrorMsg(alice, SPONSOR_ROLE));
    });

    it('adds a sponsor to the vault', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);
      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

      expect(await vault.totalSponsored()).to.eq(parseUnits('1000'));
    });

    it('adds a sponsor to the vault after added sponsor role', async () => {
      await addUnderlyingBalance(bob, '1000');

      await vault.connect(owner).grantRole(SPONSOR_ROLE, bob.address);
      await vault
        .connect(bob)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);
      await vault
        .connect(bob)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);
      expect(await vault.totalSponsored()).to.eq(parseUnits('1000'));

      await vault.connect(owner).revokeRole(SPONSOR_ROLE, bob.address);
    });

    it('emits an event', async () => {
      await addUnderlyingBalance(owner, '1000');

      const tx = await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

      await expect(tx)
        .to.emit(vault, 'Sponsored')
        .withArgs(
          1,
          parseUnits('500'),
          owner.address,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
        );
    });

    it('fails if the lock duration 0', async () => {
      await addUnderlyingBalance(owner, '1000');

      await expect(
        vault.connect(owner).sponsor(underlying.address, parseUnits('500'), 0),
      ).to.be.revertedWith('VaultInvalidLockPeriod');
    });

    it('fails if the lock duration is less than the minimum', async () => {
      await addUnderlyingBalance(owner, '1000');
      const lockDuration = 1;

      await expect(
        vault
          .connect(owner)
          .sponsor(underlying.address, parseUnits('500'), lockDuration),
      ).to.be.revertedWith('VaultInvalidLockPeriod');
    });

    it('fails if the lock duration is larger than the maximum', async () => {
      await addUnderlyingBalance(owner, '1000');
      const lockDuration = BigNumber.from(time.duration.years(100).toNumber());

      await expect(
        vault
          .connect(owner)
          .sponsor(underlying.address, parseUnits('500'), lockDuration),
      ).to.be.revertedWith('VaultInvalidLockPeriod');
    });

    it('fails if the sponsor amount is 0', async () => {
      await addUnderlyingBalance(owner, '1000');
      const lockDuration = BigNumber.from(time.duration.days(15).toNumber());

      await expect(
        vault
          .connect(owner)
          .sponsor(underlying.address, parseUnits('0'), lockDuration),
      ).to.be.revertedWith('VaultCannotSponsor0');
    });

    it('mints Depositor NFT to sponsor', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

      const deposit = await vault.deposits(1);
      expect(deposit.owner).to.be.equal(owner.address);
    });

    it('updates deposit info for sponsor', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

      const currentTime = await getLastBlockTimestamp();

      const deposit = await vault.deposits(1);
      expect(deposit.amount).to.be.equals(parseUnits('500'));
      expect(deposit.lockedUntil).to.be.equal(currentTime.add(TWO_WEEKS));
      expect(deposit.shares).to.be.equal(0);
    });

    it('transfers underlying from user at sponsor', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('400'), TWO_WEEKS);

      expect(await vault.totalUnderlying()).to.equal(parseUnits('400'));
      expect(await underlying.balanceOf(vault.address)).to.equal(
        parseUnits('400'),
      );
      expect(await underlying.balanceOf(owner.address)).to.equal(
        parseUnits('600'),
      );
    });
  });

  describe('unsponsor', () => {
    it('removes a sponsor from the vault', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);
      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

      await moveForwardTwoWeeks();
      await vault.connect(owner).unsponsor(newAccount.address, [1]);

      expect(await vault.totalSponsored()).to.eq(parseUnits('500'));
      expect(await underlying.balanceOf(newAccount.address)).to.eq(
        parseUnits('500'),
      );
    });

    it('emits an event', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

      await moveForwardTwoWeeks();
      const tx = await vault.connect(owner).unsponsor(bob.address, [1]);

      await expect(tx).to.emit(vault, 'Unsponsored').withArgs(1);
    });

    it('fails if the caller is not the owner', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

      await vault.connect(owner).grantRole(SPONSOR_ROLE, bob.address);
      await expect(
        vault.connect(bob).unsponsor(owner.address, [1]),
      ).to.be.revertedWith('VaultNotAllowed');

      await vault.connect(owner).revokeRole(SPONSOR_ROLE, bob.address);
    });

    it('fails if the destination address is 0x', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

      await expect(
        vault
          .connect(owner)
          .unsponsor('0x0000000000000000000000000000000000000000', [1]),
      ).to.be.revertedWith('VaultDestinationCannotBe0Address');
    });

    it('fails if the amount is still locked', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

      await expect(
        vault.connect(owner).unsponsor(owner.address, [1]),
      ).to.be.revertedWith('VaultAmountLocked');
    });

    it('fails if the token id belongs to a withdraw', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault.connect(owner).deposit(
        depositParams.build({
          lockDuration: TWO_WEEKS,
          amount: parseUnits('500'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(owner.address).build()],
        }),
      );
      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

      await moveForwardTwoWeeks();

      await expect(
        vault.connect(owner).unsponsor(owner.address, [1, 2]),
      ).to.be.revertedWith('VaultNotSponsor');
    });

    it('fails if there are not enough funds', async () => {
      await addUnderlyingBalance(owner, '1000');

      await vault
        .connect(owner)
        .sponsor(underlying.address, parseUnits('1000'), TWO_WEEKS);
      await moveForwardTwoWeeks();

      await removeUnderlyingFromVault('500');

      await expect(
        vault.connect(owner).unsponsor(owner.address, [1]),
      ).to.be.revertedWith('VaultNotEnoughFunds');
    });
  });

  describe('depositForGroupId', () => {
    it('reverts if contract is paused', async () => {
      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
          name: 'My Deposit',
        }),
      );

      await vault.connect(owner).pause();

      const topUpParams = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
        name: 'My Deposit',
      });

      await expect(
        vault.connect(alice).depositForGroupId(0, topUpParams),
      ).to.be.revertedWith('Pausable: paused');

      await vault.connect(owner).unpause();
    });

    it('emits events', async () => {
      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
          name: 'My Deposit',
        }),
      );

      const params = depositParams.build({
        lockDuration: TWO_WEEKS,
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams
            .percent(50)
            .data(ethers.utils.hexlify(123))
            .to(bob.address)
            .build(),
        ],
        name: 'My Deposit',
      });

      const tx = await vault.connect(alice).depositForGroupId(0, params);

      await expect(tx)
        .to.emit(vault, 'DepositMinted')
        .withArgs(
          2,
          0,
          parseUnits('50'),
          parseUnits('50').mul(SHARES_MULTIPLIER),
          alice.address,
          carol.address,
          carol.address,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
          '0x00',
          'My Deposit',
        );

      await expect(tx)
        .to.emit(vault, 'DepositMinted')
        .withArgs(
          3,
          0,
          parseUnits('50'),
          parseUnits('50').mul(SHARES_MULTIPLIER),
          alice.address,
          bob.address,
          bob.address,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
          ethers.utils.hexlify(123),
          'My Deposit',
        );
    });

    it('sets a timelock of at least 2 weeks by default', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(carol.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await vault.connect(alice).depositForGroupId(0, params);

      const deposit = await vault.deposits(2);

      expect(deposit.lockedUntil.toNumber()).to.be.at.least(
        TWO_WEEKS.add(await getLastBlockTimestamp()),
      );
    });

    it("fails if the groupId doesn't exist", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      const action = vault.connect(alice).depositForGroupId(0, params);

      await expect(action).to.be.revertedWith('VaultSenderNotOwnerOfGroupId');
    });

    it("fails if the groupId doesn't belong to the caller", async () => {
      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(carol.address).build()],
        }),
      );

      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      const action = vault.connect(bob).depositForGroupId(0, params);

      await expect(action).to.be.revertedWith('VaultSenderNotOwnerOfGroupId');
    });

    it('fails if the timelock is less than 2 weeks', async () => {
      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(bob.address).build()],
        }),
      );

      const params = depositParams.build({
        amount: parseUnits('100'),
        lockDuration: BigNumber.from(time.duration.days(13).toNumber()),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      const action = vault.connect(alice).depositForGroupId(0, params);

      await expect(action).to.be.revertedWith('VaultInvalidLockPeriod');
    });

    it('fails if the claim percentage is 0', async () => {
      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(bob.address).build()],
        }),
      );

      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(100).to(bob.address).build(),
          claimParams.percent(0).to(bob.address).build(),
        ],
      });

      const action = vault.connect(alice).depositForGroupId(0, params);

      await expect(action).to.be.revertedWith('VaultClaimPercentageCannotBe0');
    });

    it('fails if the amount is 0', async () => {
      await vault.connect(alice).deposit(
        depositParams.build({
          amount: parseUnits('1000'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(bob.address).build()],
        }),
      );

      const params = depositParams.build({
        amount: parseUnits('0'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      const action = vault.connect(alice).depositForGroupId(0, params);

      await expect(action).to.be.revertedWith('VaultCannotDeposit0');
    });
  });

  describe('deposit', () => {
    it('reverts if contract is paused', async () => {
      const params = depositParams.build({
        lockDuration: TWO_WEEKS,
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
        name: 'Deposit - Emits Different groupId',
      });
      await vault.connect(owner).pause();
      await expect(vault.connect(owner).deposit(params)).to.be.revertedWith(
        'Pausable: paused',
      );
      await vault.connect(owner).unpause();
    });

    it('emits events', async () => {
      const params = depositParams.build({
        lockDuration: TWO_WEEKS,
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams
            .percent(50)
            .data(ethers.utils.hexlify(123))
            .to(bob.address)
            .build(),
        ],
        name: 'Deposit - Emits Events',
      });

      const tx = await vault.connect(alice).deposit(params);

      await expect(tx)
        .to.emit(vault, 'DepositMinted')
        .withArgs(
          1,
          0,
          parseUnits('50'),
          parseUnits('50').mul(SHARES_MULTIPLIER),
          alice.address,
          carol.address,
          carol.address,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
          '0x00',
          'Deposit - Emits Events',
        );

      await expect(tx)
        .to.emit(vault, 'DepositMinted')
        .withArgs(
          2,
          0,
          parseUnits('50'),
          parseUnits('50').mul(SHARES_MULTIPLIER),
          alice.address,
          bob.address,
          bob.address,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
          ethers.utils.hexlify(123),
          'Deposit - Emits Events',
        );
    });

    it('emits events with a different groupId per deposit', async () => {
      const params = depositParams.build({
        lockDuration: TWO_WEEKS,
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
        name: 'Deposit - Emits Different groupId',
      });

      await vault.connect(alice).deposit(params);
      const tx = await vault.connect(alice).deposit(params);

      await expect(tx)
        .to.emit(vault, 'DepositMinted')
        .withArgs(
          3,
          1,
          parseUnits('50'),
          parseUnits('50').mul(SHARES_MULTIPLIER),
          alice.address,
          carol.address,
          carol.address,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
          '0x00',
          'Deposit - Emits Different groupId',
        );

      await expect(tx)
        .to.emit(vault, 'DepositMinted')
        .withArgs(
          4,
          1,
          parseUnits('50'),
          parseUnits('50').mul(SHARES_MULTIPLIER),
          alice.address,
          bob.address,
          bob.address,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
          '0x00',
          'Deposit - Emits Different groupId',
        );
    });

    it('sets a timelock of at least 2 weeks by default', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);

      const deposit = await vault.deposits(1);

      expect(deposit.lockedUntil.toNumber()).to.be.at.least(
        TWO_WEEKS.add(await getLastBlockTimestamp()),
      );
    });

    it('fails if the timelock is less than 2 weeks', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        lockDuration: BigNumber.from(time.duration.days(13).toNumber()),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      const action = vault.connect(alice).deposit(params);

      await expect(action).to.be.revertedWith('VaultInvalidLockPeriod');
    });

    it('fails if the claim percentage is 0', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(100).to(bob.address).build(),
          claimParams.percent(0).to(bob.address).build(),
        ],
      });

      const action = vault.connect(alice).deposit(params);

      await expect(action).to.be.revertedWith('VaultClaimPercentageCannotBe0');
    });

    it('fails if the amount is 0', async () => {
      const params = depositParams.build({
        amount: parseUnits('0'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      const action = vault.connect(alice).deposit(params);

      await expect(action).to.be.revertedWith('VaultCannotDeposit0');
    });
  });

  ['withdraw', 'forceWithdraw'].map((vaultAction) => {
    describe(vaultAction, () => {
      it('emits events', async () => {
        const params = depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [
            claimParams.percent(50).to(carol.address).build(),
            claimParams.percent(50).to(bob.address).build(),
          ],
        });

        await vault.connect(alice).deposit(params);

        await moveForwardTwoWeeks();
        const tx = await vault
          .connect(alice)
          [vaultAction](alice.address, [1, 2]);

        await expect(tx)
          .to.emit(vault, 'DepositWithdrawn')
          .withArgs(
            1,
            parseUnits('50').mul(SHARES_MULTIPLIER),
            parseUnits('50'),
            alice.address,
            true,
          );
        await expect(tx)
          .to.emit(vault, 'DepositWithdrawn')
          .withArgs(
            2,
            parseUnits('50').mul(SHARES_MULTIPLIER),
            parseUnits('50'),
            alice.address,
            true,
          );
      });

      it('withdraws the principal of a deposit', async () => {
        const params = depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [
            claimParams.percent(50).to(carol.address).build(),
            claimParams.percent(50).to(bob.address).build(),
          ],
        });

        await vault.connect(alice).deposit(params);

        expect(await underlying.balanceOf(alice.address)).to.eq(
          parseUnits('900'),
        );

        await moveForwardTwoWeeks();
        await vault.connect(alice)[vaultAction](alice.address, [1, 2]);

        expect(await underlying.balanceOf(alice.address)).to.eq(
          parseUnits('1000'),
        );
      });

      it('withdraws funds to a different address', async () => {
        const params = depositParams.build({
          inputToken: underlying.address,
          amount: parseUnits('100'),
          claims: [claimParams.percent(100).to(bob.address).build()],
        });

        await vault.connect(alice).deposit(params);
        await moveForwardTwoWeeks();
        await vault.connect(alice)[vaultAction](carol.address, [1]);

        expect(await underlying.balanceOf(carol.address)).to.eq(
          parseUnits('1100'),
        );
      });

      it('removes the shares from the claimers', async () => {
        const params = depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [
            claimParams.percent(50).to(carol.address).build(),
            claimParams.percent(50).to(bob.address).build(),
          ],
        });

        await vault.connect(alice).deposit(params);

        expect(await vault.sharesOf(carol.address)).to.eq(
          parseUnits('50').mul(SHARES_MULTIPLIER),
        );
        expect(await vault.sharesOf(bob.address)).to.eq(
          parseUnits('50').mul(SHARES_MULTIPLIER),
        );

        await moveForwardTwoWeeks();
        await vault.connect(alice)[vaultAction](alice.address, [1]);

        expect(await vault.sharesOf(carol.address)).to.eq(0);
        expect(await vault.sharesOf(bob.address)).to.eq(
          parseUnits('50').mul(SHARES_MULTIPLIER),
        );
      });

      it('removes the principal from the claimers', async () => {
        const params = depositParams.build({
          amount: parseUnits('100'),
          inputToken: underlying.address,
          claims: [
            claimParams.percent(50).to(carol.address).build(),
            claimParams.percent(50).to(bob.address).build(),
          ],
        });

        await vault.connect(alice).deposit(params);

        expect(await vault.principalOf(carol.address)).to.eq(parseUnits('50'));
        expect(await vault.principalOf(bob.address)).to.eq(parseUnits('50'));

        await moveForwardTwoWeeks();
        await vault.connect(alice)[vaultAction](alice.address, [1]);

        expect(await vault.principalOf(carol.address)).to.eq(0);
        expect(await vault.principalOf(bob.address)).to.eq(parseUnits('50'));
      });

      it('fails if the destination address is 0x', async () => {
        await addUnderlyingBalance(alice, '1000');
        await addUnderlyingBalance(bob, '1000');

        const params = depositParams.build({
          inputToken: underlying.address,
          amount: parseUnits('100'),
          claims: [claimParams.percent(100).to(carol.address).build()],
        });

        await vault.connect(alice).deposit(params);
        await vault.connect(bob).deposit(params);

        await moveForwardTwoWeeks();
        const action = vault
          .connect(bob)
          [vaultAction]('0x0000000000000000000000000000000000000000', [1, 2]);

        await expect(action).to.be.revertedWith(
          'VaultDestinationCannotBe0Address',
        );
      });

      it("fails if the caller doesn't own the deposit", async () => {
        const params = depositParams.build({
          inputToken: underlying.address,
          amount: parseUnits('100'),
          claims: [claimParams.percent(100).to(carol.address).build()],
        });

        await vault.connect(alice).deposit(params);
        await vault.connect(bob).deposit(params);

        await moveForwardTwoWeeks();
        const action = vault.connect(bob)[vaultAction](bob.address, [1, 2]);

        await expect(action).to.be.revertedWith('VaultNotOwnerOfDeposit');
      });

      it('fails if the deposit is locked', async () => {
        const params = depositParams.build({
          lockDuration: TWO_WEEKS,
          inputToken: underlying.address,
          amount: parseUnits('100'),
          claims: [claimParams.percent(100).to(bob.address).build()],
        });

        await vault.connect(alice).deposit(params);

        const action = vault.connect(alice)[vaultAction](alice.address, [1]);

        await expect(action).to.be.revertedWith('VaultDepositLocked');
      });

      it('fails if token id belongs to a sponsor', async () => {
        await addUnderlyingBalance(owner, '1000');

        await vault.connect(owner).deposit(
          depositParams.build({
            lockDuration: TWO_WEEKS,
            amount: parseUnits('500'),
            inputToken: underlying.address,
            claims: [claimParams.percent(100).to(owner.address).build()],
          }),
        );
        await vault
          .connect(owner)
          .sponsor(underlying.address, parseUnits('500'), TWO_WEEKS);

        await moveForwardTwoWeeks();

        await expect(
          vault.connect(owner)[vaultAction](owner.address, [1, 2]),
        ).to.be.revertedWith('VaultNotDeposit');
      });
    });
  });

  describe('forceWithdraw', () => {
    it("works if the vault doesn't have enough funds", async () => {
      const params = depositParams.build({
        amount: parseUnits('1000'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(carol.address).build()],
      });

      await vault.connect(alice).deposit(params);
      await moveForwardTwoWeeks();
      await removeUnderlyingFromVault('500');

      await vault.connect(alice).forceWithdraw(alice.address, [1]);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('500'),
      );
    });
  });

  describe('withdraw', () => {
    it("fails if the vault doesn't have enough funds", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(carol.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await moveForwardTwoWeeks();
      await removeUnderlyingFromVault('50');

      const action = vault.connect(alice).withdraw(alice.address, [1]);

      await expect(action).to.be.revertedWith(
        'VaultCannotWithdrawMoreThanAvailable',
      );
    });
  });

  describe('partialWithdraw', () => {
    it("reduces the deposits' shares and amount", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(alice.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);

      await moveForwardTwoWeeks();
      await addYieldToVault('100');

      await vault
        .connect(alice)
        .partialWithdraw(
          alice.address,
          [1, 2],
          [parseUnits('25'), parseUnits('30')],
        );

      const deposit = await vault.deposits(1);
      expect(deposit.amount).to.eq(parseUnits('25'));
      expect(deposit.shares).to.eq(parseUnits('37.5').mul(SHARES_MULTIPLIER));

      const deposit2 = await vault.deposits(2);
      expect(deposit2.amount).to.eq(parseUnits('20'));
      expect(deposit2.shares).to.eq(parseUnits('35').mul(SHARES_MULTIPLIER));
    });

    it("reduces the claimer's totalShares and totalPrincipal", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(alice.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);

      await moveForwardTwoWeeks();
      await addYieldToVault('100');

      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [2], [parseUnits('30')]);

      const deposit = await vault.claimer(bob.address);
      expect(deposit.totalPrincipal).to.eq(parseUnits('20'));
      expect(deposit.totalShares).to.eq(
        parseUnits('35').mul(SHARES_MULTIPLIER),
      );
    });

    it('removes the deposit for full withdrawals', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(alice.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);

      await moveForwardTwoWeeks();
      await addYieldToVault('100');

      await vault
        .connect(alice)
        .partialWithdraw(alice.address, [2], [parseUnits('50')]);

      const deposit = await vault.deposits(2);

      expect(deposit.amount).to.eq(0);
      //expect(deposit.claimerId).to.eq(0);
      expect(deposit.lockedUntil).to.eq(0);
      expect(deposit.shares).to.eq(0);
    });

    it('fails if the vault lost funds', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await moveForwardTwoWeeks();
      await removeUnderlyingFromVault('50');

      const tx = vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('25')]);

      await expect(tx).to.be.revertedWith(
        'VaultCannotWithdrawMoreThanAvailable',
      );
    });

    it('fails for full withdrawals if the vault lost funds', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await moveForwardTwoWeeks();
      await removeUnderlyingFromVault('50');

      const tx = vault
        .connect(alice)
        .partialWithdraw(alice.address, [1], [parseUnits('100')]);

      await expect(tx).to.be.revertedWith(
        'VaultCannotWithdrawMoreThanAvailable',
      );
    });

    it('emits an event', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(alice.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);

      await moveForwardTwoWeeks();

      const tx = vault
        .connect(alice)
        .partialWithdraw(alice.address, [2], [parseUnits('25')]);

      await expect(tx)
        .to.emit(vault, 'DepositWithdrawn')
        .withArgs(
          2,
          parseUnits('25').mul(SHARES_MULTIPLIER),
          parseUnits('25'),
          alice.address,
          false,
        );
    });
  });

  describe('claimYield', () => {
    it('emits an event', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault('100');
      const tx = await vault.connect(carol).claimYield(carol.address);

      await expect(tx)
        .to.emit(vault, 'YieldClaimed')
        .withArgs(
          carol.address,
          carol.address,
          parseUnits('49'),
          parseUnits('25').mul(SHARES_MULTIPLIER),
          parseUnits('1'),
          parseUnits('200'),
          parseUnits('100').mul(SHARES_MULTIPLIER),
        );
    });

    it('claims the yield of a user', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault('100');
      await vault.connect(carol).claimYield(carol.address);

      const carolYield = await vault.yieldFor(carol.address);
      expect(carolYield.claimableYield).to.eq(parseUnits('0'));
      expect(carolYield.shares).to.eq(parseUnits('0'));
      expect(carolYield.perfFee).to.eq(parseUnits('0'));

      expect(await underlying.balanceOf(carol.address)).to.eq(
        parseUnits('1049'),
      );

      const bobYield = await vault.yieldFor(bob.address);
      expect(bobYield.claimableYield).to.eq(parseUnits('49'));
      expect(bobYield.shares).to.eq(parseUnits('25').mul(SHARES_MULTIPLIER));
      expect(bobYield.perfFee).to.eq(parseUnits('1'));
    });

    it('accumulate performance fee', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault('100');
      await vault.connect(carol).claimYield(carol.address);
      expect(await vault.accumulatedPerfFee()).to.eq(parseUnits('1'));
    });

    it('claims the yield to a different address', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault('100');
      const action = () => vault.connect(bob).claimYield(carol.address);

      await expect(action).to.changeTokenBalance(
        underlying,
        carol,
        parseUnits('98'),
      );
    });

    it('fails is the destination address is 0x', async () => {
      await addUnderlyingBalance(alice, '1000');

      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault('100');

      await expect(
        vault
          .connect(bob)
          .claimYield('0x0000000000000000000000000000000000000000'),
      ).to.be.revertedWith('VaultDestinationCannotBe0Address');
    });

    it('updates shares after claim', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault('100');
      await vault.connect(carol).claimYield(carol.address);

      expect(await vault.totalShares()).to.be.equal(
        parseUnits('75').mul(SHARES_MULTIPLIER),
      );
      expect(await vault.sharesOf(carol.address)).to.be.equal(
        parseUnits('25').mul(SHARES_MULTIPLIER),
      );
    });
  });

  describe('yieldFor', () => {
    it('returns (0, 0, 0) if no yield was generated', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(alice.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);

      const aliceYield = await vault.yieldFor(alice.address);
      expect(aliceYield.claimableYield).to.eq(0);
      expect(aliceYield.shares).to.eq(0);
      expect(aliceYield.perfFee).to.eq(0);

      const bobYield = await vault.yieldFor(bob.address);
      expect(bobYield.claimableYield).to.eq(0);
      expect(bobYield.shares).to.eq(0);
      expect(bobYield.perfFee).to.eq(0);
    });

    it('returns the amount of yield claimable by a user, share of yield and performance fee', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(alice.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
      const newYield = await addYieldToVault('100');
      const yieldPerUser = newYield.div(BigNumber.from('2'));
      const perfFee = yieldPerUser.mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR);

      const aliceYield = await vault.yieldFor(alice.address);
      expect(aliceYield.claimableYield).to.eq(yieldPerUser.sub(perfFee));
      expect(aliceYield.shares).to.eq(parseUnits('25').mul(SHARES_MULTIPLIER));
      expect(aliceYield.perfFee).to.eq(perfFee);

      const bobYield = await vault.yieldFor(bob.address);
      expect(bobYield.claimableYield).to.eq(yieldPerUser.sub(perfFee));
      expect(bobYield.shares).to.eq(parseUnits('25').mul(SHARES_MULTIPLIER));
      expect(bobYield.perfFee).to.eq(perfFee);
    });
  });

  describe('deposit', () => {
    it('fails if amount is 0', async () => {
      const params = depositParams.build({
        amount: parseUnits('0'),
        inputToken: underlying.address,
      });

      await expect(vault.connect(alice).deposit(params)).to.be.revertedWith(
        'VaultCannotDeposit0',
      );
    });

    it('fails if lock duration is shorter than minimum', async () => {
      const params = depositParams.build({
        lockDuration: TWO_WEEKS.sub(BigNumber.from('1')),
        inputToken: underlying.address,
      });

      await expect(vault.connect(alice).deposit(params)).to.be.revertedWith(
        'VaultInvalidLockPeriod',
      );
    });

    it('fails if lock duration is longer than maximum', async () => {
      const params = depositParams.build({
        lockDuration: MAX_DEPOSIT_LOCK_DURATION.add(BigNumber.from('1')),
        inputToken: underlying.address,
      });

      await expect(vault.connect(alice).deposit(params)).to.be.revertedWith(
        'VaultInvalidLockPeriod',
      );
    });

    it('fails if the yield is negative', async () => {
      const params = depositParams.build({
        amount: parseUnits('1000'),
        inputToken: underlying.address,
      });

      await vault.connect(alice).deposit(params);

      await removeUnderlyingFromVault('21');

      await expect(vault.connect(alice).deposit(params)).to.be.revertedWith(
        'VaultCannotDepositWhenYieldNegative',
      );
    });

    it("works if the negative yield is less than the strategy's estimated fees", async () => {
      await vault.setStrategy(strategy.address);

      const params = depositParams.build({
        amount: parseUnits('500'),
        inputToken: underlying.address,
      });

      await vault.connect(alice).deposit(params);

      await removeUnderlyingFromVault('1');

      await vault.connect(alice).deposit(params);
    });

    it('works with valid parameters', async () => {
      const params = depositParams.build({
        inputToken: underlying.address,
      });

      await vault.connect(alice).deposit(params);
    });

    it('works with multiple claims', async () => {
      const params = depositParams.build({
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).build(),
          claimParams.percent(50).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
    });

    it('calculates correct number of shares for first deposit', async () => {
      const amount = parseUnits('1');
      const params = depositParams.build({
        amount,
        inputToken: underlying.address,
      });

      await vault.connect(alice).deposit(params);

      expect(await vault.totalShares()).to.equal(amount.mul(SHARES_MULTIPLIER));
    });

    it('calculates correct number of shares for second deposit of equal size', async () => {
      const amount = parseUnits('1');
      const params = depositParams.build({
        amount,
        inputToken: underlying.address,
      });

      // deposit 1 unit
      await vault.connect(alice).deposit(params);

      // deposit 1 unit
      await vault.connect(bob).deposit(params);

      // total shares must be 2 units
      expect(await vault.totalShares()).to.equal(
        amount.mul(2).mul(SHARES_MULTIPLIER),
      );
    });

    it('calculates correct number of shares for second deposit of different size', async () => {
      const amount = parseUnits('1');

      // deposit 1 unit
      const params1 = depositParams.build({
        amount,
        inputToken: underlying.address,
      });
      await vault.connect(alice).deposit(params1);

      // deposit 2 unit
      const params2 = depositParams.build({
        amount: amount.mul(2),
        inputToken: underlying.address,
      });
      await vault.connect(bob).deposit(params2);

      // total shares must be 3 units
      expect(await vault.totalShares()).to.equal(
        amount.mul(3).mul(SHARES_MULTIPLIER),
      );
    });

    it('fails if pct does not add up to 100%', async () => {
      const params = depositParams.build({
        inputToken: underlying.address,
        claims: [
          claimParams.percent(49).build(),
          claimParams.percent(50).build(),
        ],
      });

      const action = vault.connect(alice).deposit(params);

      await expect(action).to.be.revertedWith('VaultClaimsDontAddUp');
    });

    it('transfers underlying from user at deposit', async () => {
      const balanceBefore = await underlying.balanceOf(alice.address);

      const params = depositParams.build({
        inputToken: underlying.address,
      });

      await vault.connect(alice).deposit(params);

      expect(await vault.totalUnderlying()).to.equal(params.amount);
      expect(await underlying.balanceOf(vault.address)).to.equal(params.amount);
      expect(await underlying.balanceOf(alice.address)).to.equal(
        balanceBefore.sub(params.amount),
      );
    });

    it('updates claimers info for first deposit', async () => {
      const params = depositParams.build({
        inputToken: underlying.address,
        claims: [
          claimParams.percent(40).build({
            beneficiary: bob.address,
          }),
          claimParams.percent(60).build({
            beneficiary: carol.address,
          }),
        ],
      });

      await vault.connect(alice).deposit(params);

      const claimer1 = await vault.claimer(bob.address);
      expect(claimer1.totalShares).to.be.equal(
        parseUnits('0.4').mul(SHARES_MULTIPLIER),
      );
      expect(claimer1.totalPrincipal).to.be.equal(parseUnits('0.4'));

      const claimer2 = await vault.claimer(carol.address);
      expect(claimer2.totalShares).to.be.equal(
        parseUnits('0.6').mul(SHARES_MULTIPLIER),
      );
      expect(claimer2.totalPrincipal).to.be.equal(parseUnits('0.6'));
    });

    it('updates claimers info for second deposit', async () => {
      const params1 = depositParams.build({
        inputToken: underlying.address,
        claims: [
          claimParams.percent(40).build({
            beneficiary: bob.address,
          }),
          claimParams.percent(60).build({
            beneficiary: carol.address,
          }),
        ],
      });

      const params2 = depositParams.build({
        inputToken: underlying.address,
        amount: parseUnits('10'),
        claims: [
          claimParams.build({
            beneficiary: bob.address,
          }),
        ],
      });

      await vault.connect(alice).deposit(params1);

      await vault.connect(alice).deposit(params2);

      const claimer1 = await vault.claimer(bob.address);
      expect(claimer1.totalShares).to.be.equal(
        parseUnits('10.4').mul(SHARES_MULTIPLIER),
      );
      expect(claimer1.totalPrincipal).to.be.equal(parseUnits('10.4'));

      const claimer2 = await vault.claimer(carol.address);
      expect(claimer2.totalShares).to.be.equal(
        parseUnits('0.6').mul(SHARES_MULTIPLIER),
      );
      expect(claimer2.totalPrincipal).to.be.equal(parseUnits('0.6'));
    });

    it('updates deposits info at deposit', async () => {
      const params = depositParams.build({
        inputToken: underlying.address,
        claims: [
          claimParams.percent(40).build({
            beneficiary: bob.address,
          }),
          claimParams.percent(60).build({
            beneficiary: carol.address,
          }),
        ],
      });

      await vault.connect(alice).deposit(params);

      const currentTime = await getLastBlockTimestamp();

      const deposit1 = await vault.deposits(1);
      expect(deposit1.amount).to.be.equal(parseUnits('0.4'));
      expect(deposit1.claimerId).to.be.equal(bob.address);
      expect(deposit1.lockedUntil).to.be.equal(
        currentTime.add(params.lockDuration),
      );
      expect(deposit1.shares).to.be.equal(
        parseUnits('0.4').mul(SHARES_MULTIPLIER),
      );

      const deposit2 = await vault.deposits(2);
      expect(deposit2.amount).to.be.equal(parseUnits('0.6'));
      expect(deposit2.claimerId).to.be.equal(carol.address);
      expect(deposit2.lockedUntil).to.be.equal(
        currentTime.add(params.lockDuration),
      );
      expect(deposit2.shares).to.be.equal(
        parseUnits('0.6').mul(SHARES_MULTIPLIER),
      );
    });
  });

  describe('pause/unpause', () => {
    it('reverts(pause) if not DEFAULT_ADMIN_ROLE', async () => {
      await expect(vault.connect(alice).pause()).to.be.revertedWith(
        getRoleErrorMsg(alice, DEFAULT_ADMIN_ROLE),
      );
    });
    it('reverts(unpause) if not DEFAULT_ADMIN_ROLE', async () => {
      await expect(vault.connect(alice).unpause()).to.be.revertedWith(
        getRoleErrorMsg(alice, DEFAULT_ADMIN_ROLE),
      );
    });
  });

  async function addYieldToVault(amount: string) {
    await underlying.mint(vault.address, parseUnits(amount));
    return parseUnits(amount);
  }

  async function addUnderlyingBalance(
    account: SignerWithAddress,
    amount: string,
  ) {
    await underlying.mint(account.address, parseUnits(amount));
    return underlying
      .connect(account)
      .approve(vault.address, parseUnits(amount));
  }

  function removeUnderlyingFromVault(amount: string) {
    return underlying.burn(vault.address, parseUnits(amount));
  }

  const setAUstRate = async (rate: BigNumber) => {
    await mockAUstUstFeed.setLatestRoundData(1, rate, 1000, 1000, 1);
  };
});
