import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';
import {
  MockChainlinkPriceFeed,
  Vault,
  AnchorStrategy,
  MockERC20,
  AnchorStrategy__factory,
} from '../../../typechain';
import { generateNewAddress } from '../../shared/';

describe('AnchorStrategy', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let strategy: AnchorStrategy;
  let mockAUstUstFeed: MockChainlinkPriceFeed;
  let ustToken: MockERC20;
  let aUstToken: MockERC20;
  let underlying: MockERC20;
  const TREASURY = generateNewAddress();
  const AUST_TO_UST_FEED_DECIMALS = utils.parseEther('1');
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
    ustToken = await MockERC20.deploy(
      'UST',
      'UST',
      18,
      utils.parseEther('1000000000'),
    );
    aUstToken = await MockERC20.deploy(
      'aUST',
      'aUST',
      18,
      utils.parseEther('1000000000'),
    );
    underlying = ustToken;

    const MockChainlinkPriceFeedFactory = await ethers.getContractFactory(
      'MockChainlinkPriceFeed',
    );
    mockAUstUstFeed = await MockChainlinkPriceFeedFactory.deploy(18);

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

    const AnchorStrategyFactory = await ethers.getContractFactory(
      'AnchorStrategy',
    );

    strategy = await AnchorStrategyFactory.deploy(
      vault.address,
      mockAUstUstFeed.address,
      ustToken.address,
      aUstToken.address,
      owner.address,
    );

    await strategy.connect(owner).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);
    await underlying
      .connect(owner)
      .approve(vault.address, constants.MaxUint256);
  });

  describe('constructor', () => {
    let AnchorStrategyFactory: AnchorStrategy__factory;

    beforeEach(async () => {
      AnchorStrategyFactory = await ethers.getContractFactory('AnchorStrategy');
    });

    it('Revert if owner is address(0)', async () => {
      await expect(
        AnchorStrategyFactory.deploy(
          vault.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          constants.AddressZero,
        ),
      ).to.be.revertedWith('StrategyOwnerCannotBe0Address');
    });

    it('Revert if ust is address(0)', async () => {
      await expect(
        AnchorStrategyFactory.deploy(
          vault.address,
          mockAUstUstFeed.address,
          constants.AddressZero,
          aUstToken.address,
          owner.address,
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it('Revert if aUST is address(0)', async () => {
      await expect(
        AnchorStrategyFactory.deploy(
          vault.address,
          mockAUstUstFeed.address,
          ustToken.address,
          constants.AddressZero,
          owner.address,
        ),
      ).to.be.revertedWith('StrategyYieldTokenCannotBe0Address');
    });

    it('Revert if vault does not have IVault interface', async () => {
      await expect(
        AnchorStrategyFactory.deploy(
          TREASURY,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          owner.address,
        ),
      ).to.be.revertedWith('StrategyNotIVault');
    });

    it('Check initial values', async () => {
      expect(
        await strategy.hasRole(DEFAULT_ADMIN_ROLE, owner.address),
      ).to.be.equal(true);
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.equal(
        true,
      );
      expect(await strategy.vault()).to.be.equal(vault.address);

      expect(await strategy.aUstToUstFeed()).to.be.equal(
        mockAUstUstFeed.address,
      );
      expect(await strategy.ustToken()).to.be.equal(ustToken.address);
      expect(await strategy.aUstToken()).to.be.equal(aUstToken.address);
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
        'StrategyNoUST',
      );
    });

    it('Revert if aUST/UST exchange rate is invalid', async () => {
      const operator0 = generateNewAddress();

      const amount0 = utils.parseUnits('100', 18);
      const aUstAmount0 = utils.parseUnits('90', 18);
      await underlying.connect(owner).transfer(vault.address, amount0);
      await vault.connect(owner).updateInvested();

      let exchangeRate = amount0.mul(utils.parseEther('1')).div(aUstAmount0);
      await mockAUstUstFeed.setAnswer(exchangeRate);

      // when price is not positive
      await mockAUstUstFeed.setLatestRoundData(1, 0, 100, 100, 1);
      await expect(vault.connect(owner).updateInvested()).to.be.revertedWith(
        'StrategyInvalidAUSTRate',
      );

      // when round id is invalid
      await mockAUstUstFeed.setLatestRoundData(
        3,
        utils.parseEther('1'),
        100,
        100,
        1,
      );
      await expect(vault.connect(owner).updateInvested()).to.be.revertedWith(
        'StrategyInvalidAUSTRate',
      );

      // when updated time is zero
      await mockAUstUstFeed.setLatestRoundData(
        1,
        utils.parseEther('1'),
        100,
        0,
        1,
      );
      await expect(vault.connect(owner).updateInvested()).to.be.revertedWith(
        'StrategyInvalidAUSTRate',
      );
    });

    it('Should init deposit stable with all underlying', async () => {
      let underlyingAmount = utils.parseUnits('100', 18);
      await depositVault(underlyingAmount);

      let investAmount = underlyingAmount.mul(INVEST_PCT).div(DENOMINATOR);

      expect(await vault.totalUnderlying()).equal(underlyingAmount);

      const tx = await vault.connect(owner).updateInvested();

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await strategy.pendingDeposits()).equal(investAmount);
      expect(await strategy.investedAssets()).equal(investAmount);
      expect(await vault.totalUnderlying()).equal(underlyingAmount);
      const operation = await strategy.depositOperations(0);
      expect(operation.amount).equal(investAmount);
      expect(await strategy.depositOperationLength()).equal(1);
    });

    it('Should be able to init deposit several times', async () => {
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
      expect(await strategy.pendingDeposits()).equal(
        investAmount0.add(investAmount1),
      );
      expect(await strategy.investedAssets()).equal(
        investAmount0.add(investAmount1),
      );
      expect(await vault.totalUnderlying()).equal(
        underlyingBalance0.add(underlyingBalance1),
      );
      const operation0 = await strategy.depositOperations(0);
      expect(operation0.amount).equal(investAmount0);
      const operation1 = await strategy.depositOperations(1);
      expect(operation1.amount).equal(investAmount1);
      expect(await strategy.depositOperationLength()).equal(2);
    });
  });

  describe('#withdrawAllToVault function', () => {
    const underlyingAmount0 = utils.parseUnits('100', 18);
    const aUstAmount0 = utils.parseUnits('80', 18);

    beforeEach(async () => {
      await depositVault(underlyingAmount0);
      await vault.connect(owner).updateInvested();

      await strategy.connect(manager).finishDepositStable(0);
    });

    it('Revert if msg.sender is not manager', async () => {
      await expect(
        strategy.connect(alice).withdrawAllToVault(),
      ).to.be.revertedWith('StrategyCallerNotManager');
    });

    it('Should init redeem all aUST', async () => {
      let aUstRate = utils.parseEther('1.1');
      await setAUstRate(aUstRate);

      const tx = await strategy.connect(manager).withdrawAllToVault();

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await aUstToken.balanceOf(strategy.address)).equal(0);
      expect(await strategy.pendingRedeems()).equal(aUstAmount0);

      const operation = await strategy.redeemOperations(0);
      expect(operation.amount).equal(aUstAmount0);
      expect(await strategy.redeemOperationLength()).equal(1);
    });
  });

  describe('#investedAssets function', () => {
    let underlyingAmount = utils.parseEther('100');
    let aUstAmount = utils.parseEther('80');
    let convertedUst: BigNumber;
    let aUstBalance: BigNumber;

    it('Return 0 if no UST deposited', async () => {
      expect(await strategy.investedAssets()).to.be.equal(0);
    });

    it('Include pending deposits', async () => {
      await depositVault(underlyingAmount);
      await vault.updateInvested();

      expect(await strategy.investedAssets()).to.be.equal(
        underlyingAmount.mul(INVEST_PCT).div(DENOMINATOR),
      );
    });

    it('Return correct investAssets when there is no pending redeem', async () => {
      aUstBalance = await depositAndInvest(underlyingAmount, aUstAmount);

      const aUstRate = utils.parseEther('1.13');
      await setAUstRate(aUstRate);

      expect(await strategy.investedAssets()).to.be.equal(
        aUstBalance.mul(aUstRate).div(AUST_TO_UST_FEED_DECIMALS),
      );
    });

    it('Return correct investAssets when there is pending redeem', async () => {
      aUstBalance = await depositAndInvest(underlyingAmount, aUstAmount);

      await strategy.connect(manager).initRedeemStable(utils.parseEther('20'));

      const aUstRate = utils.parseEther('1.13');
      await setAUstRate(aUstRate);

      expect(await strategy.investedAssets()).to.be.equal(
        aUstBalance.mul(aUstRate).div(AUST_TO_UST_FEED_DECIMALS),
      );
    });
  });

  describe('#hasAssets function', () => {
    it('Return false if nothing invested', async () => {
      expect(await strategy.hasAssets()).to.be.equal(false);
    });

    it('Return true if there is pendingDeposits', async () => {
      await depositVault(utils.parseEther('100'));
      await vault.updateInvested();

      expect(await strategy.hasAssets()).to.be.equal(true);
    });

    it('Return true if partical redeemed', async () => {
      await depositVault(utils.parseEther('100'));
      await vault.updateInvested();

      await strategy.connect(manager).finishDepositStable(0);

      await strategy.connect(manager).initRedeemStable(utils.parseEther('30'));
      expect(await strategy.hasAssets()).to.be.equal(true);

      await strategy.connect(manager).finishRedeemStable(0);

      expect(await strategy.hasAssets()).to.be.equal(true);
    });

    it('Return true if pendingRedeem exist after all redeem initialized', async () => {
      await depositVault(utils.parseEther('100'));
      await vault.updateInvested();

      await strategy.connect(manager).finishDepositStable(0);

      await strategy
        .connect(manager)
        .initRedeemStable(await aUstToken.balanceOf(strategy.address));
      expect(await strategy.hasAssets()).to.be.equal(true);
    });

    it('Return false after all aUST redeemed', async () => {
      await depositVault(utils.parseEther('100'));
      await vault.updateInvested();

      await strategy.connect(manager).finishDepositStable(0);

      await strategy
        .connect(manager)
        .initRedeemStable(await aUstToken.balanceOf(strategy.address));

      await strategy.connect(manager).finishRedeemStable(0);

      expect(await strategy.hasAssets()).to.be.equal(false);
    });

    it('Return true if all aUST redeem finished after new init deposit stable', async () => {
      await depositVault(utils.parseEther('100'));
      await vault.updateInvested();

      await strategy.connect(manager).finishDepositStable(0);

      await strategy
        .connect(manager)
        .initRedeemStable(await aUstToken.balanceOf(strategy.address));

      await setAUstRate(utils.parseEther('1.1'));
      await depositVault(utils.parseEther('50'));
      await vault.updateInvested();

      await strategy.connect(manager).finishRedeemStable(0);

      expect(await strategy.hasAssets()).to.be.equal(true);
    });
  });

  describe('withdrawToVault', () => {
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

    it('init redeem stable for required aUST amount', async () => {
      await aUstToken.mint(strategy.address, utils.parseEther('100'));

      await setAUstRate(utils.parseEther('1.1'));

      await strategy.connect(manager).withdrawToVault(utils.parseEther('33'));

      expect(await strategy.pendingRedeems()).to.be.equal(
        utils.parseEther('30'),
      );
    });

    it('deduct pending redeem amount', async () => {
      await aUstToken.mint(strategy.address, utils.parseEther('100'));

      await setAUstRate(utils.parseEther('1.1'));

      await strategy.connect(manager).withdrawToVault(utils.parseEther('33'));

      expect(await strategy.pendingRedeems()).to.be.equal(
        utils.parseEther('30'),
      );
    });

    it('do nothing if enough aUST amount is in pending redeem', async () => {
      await aUstToken.mint(strategy.address, utils.parseEther('100'));

      await strategy.connect(manager).initRedeemStable(utils.parseEther('40'));

      await setAUstRate(utils.parseEther('1.1'));

      await strategy.connect(manager).withdrawToVault(utils.parseEther('33'));

      expect(await strategy.pendingRedeems()).to.be.equal(
        utils.parseEther('40'),
      );
    });
  });

  // Test helpers

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

  const setAUstRate = async (rate: BigNumber) => {
    await mockAUstUstFeed.setLatestRoundData(1, rate, 1000, 1000, 1);
  };

  const depositAndInvest = async (
    underlyingAmount: BigNumber,
    aUstAmount: BigNumber,
  ): Promise<BigNumber> => {
    await depositVault(underlyingAmount);
    await vault.updateInvested();

    await strategy.connect(manager).finishDepositStable(0);

    const aUSTBalance = await aUstToken.balanceOf(strategy.address);
    return aUSTBalance;
  };
});
