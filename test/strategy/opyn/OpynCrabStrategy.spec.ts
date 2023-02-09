import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  OpynCrabStrategy,
  OpynCrabStrategy__factory,
  MockUSDC,
  MockWETH,
  MockOSQTH,
  MockCrabStrategyV2,
  MockCrabNetting,
  MockSwapRouter,
  MockOracle,
  MockV3Pool,
} from '../../../typechain';

import {
  ForkHelpers,
  generateNewAddress,
  getETHBalance,
  parseUSDC,
} from '../../shared/';
import { depositParams, claimParams } from '../../shared/factories';
import { setBalance } from '../../shared/forkHelpers';
import createVaultHelpers from '../../shared/vault';

const { parseUnits } = ethers.utils;

describe('OpynCrabStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let keeper: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let strategy: OpynCrabStrategy;
  let underlying: MockUSDC;
  let weth: MockWETH;
  let oSqth: MockOSQTH;
  let crabStrategyV2: MockCrabStrategyV2;
  let crabNetting: MockCrabNetting;
  let swapRouter: MockSwapRouter;
  let oracle: MockOracle;
  let usdcWethPool: MockV3Pool;
  let wethOsqthPool: MockV3Pool;

  let CrabStrategyFactory: OpynCrabStrategy__factory;

  let addUnderlyingBalance: (
    account: SignerWithAddress,
    amount: string,
  ) => Promise<void>;

  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = BigNumber.from(time.duration.weeks(2).toNumber());
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');

  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));
  const KEEPER_ROLE = utils.keccak256(utils.toUtf8Bytes('KEEPER_ROLE'));

  beforeEach(async () => {
    [admin, alice, bob, keeper, manager] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    underlying = await MockUSDC.deploy(parseUSDC('1000000000'));

    const MockWETH = await ethers.getContractFactory('MockWETH');
    weth = await MockWETH.deploy(parseUnits('1000000000'));
    await setBalance(weth.address, parseUnits('1000000000'));

    const MockOSQTH = await ethers.getContractFactory('MockOSQTH');
    oSqth = await MockOSQTH.deploy(parseUnits('1000000000'));

    const MockCrabStrategyV2 = await ethers.getContractFactory(
      'MockCrabStrategyV2',
    );
    crabStrategyV2 = await MockCrabStrategyV2.deploy();

    const MockCrabNetting = await ethers.getContractFactory('MockCrabNetting');
    crabNetting = await MockCrabNetting.deploy(
      underlying.address,
      crabStrategyV2.address,
    );

    const MockV3Pool = await ethers.getContractFactory('MockV3Pool');
    wethOsqthPool = await MockV3Pool.deploy();
    usdcWethPool = await MockV3Pool.deploy();

    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    swapRouter = await MockSwapRouter.deploy();

    const MockOracle = await ethers.getContractFactory('MockOracle');
    oracle = await MockOracle.deploy();

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      underlying.address,
      MIN_LOCK_PERIOD,
      INVEST_PCT,
      TREASURY,
      admin.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
      0,
    );

    CrabStrategyFactory = await ethers.getContractFactory('OpynCrabStrategy');

    strategy = await CrabStrategyFactory.deploy(
      vault.address,
      admin.address,
      keeper.address,
      underlying.address,
      weth.address,
      oSqth.address,
      crabStrategyV2.address,
      crabNetting.address,
      swapRouter.address,
      oracle.address,
      usdcWethPool.address,
      wethOsqthPool.address,
    );

    await vault.setStrategy(strategy.address);

    await underlying
      .connect(admin)
      .approve(vault.address, constants.MaxUint256);

    ({ addUnderlyingBalance } = createVaultHelpers({
      vault,
      underlying,
    }));

    await strategy.grantRole(MANAGER_ROLE, manager.address);
  });

  describe('#constructor', () => {
    it('reverts if the keeper is address(0)', async () => {
      await expect(
        CrabStrategyFactory.deploy(
          vault.address,
          admin.address,
          constants.AddressZero, // keeper
          underlying.address,
          weth.address,
          oSqth.address,
          crabStrategyV2.address,
          crabNetting.address,
          swapRouter.address,
          oracle.address,
          usdcWethPool.address,
          wethOsqthPool.address,
        ),
      ).to.be.revertedWith('StrategyKeeperCannotBe0Address');
    });

    it('reverts if the weth is address(0)', async () => {
      await expect(
        CrabStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          underlying.address,
          constants.AddressZero, // weth
          oSqth.address,
          crabStrategyV2.address,
          crabNetting.address,
          swapRouter.address,
          oracle.address,
          usdcWethPool.address,
          wethOsqthPool.address,
        ),
      ).to.be.revertedWith('StrategyWethCannotBe0Address');
    });

    it('reverts if the squeeth is address(0)', async () => {
      await expect(
        CrabStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          underlying.address,
          weth.address,
          constants.AddressZero, // squeeth
          crabStrategyV2.address,
          crabNetting.address,
          swapRouter.address,
          oracle.address,
          usdcWethPool.address,
          wethOsqthPool.address,
        ),
      ).to.be.revertedWith('StrategySqueethCannotBe0Address');
    });

    it('reverts if the crab strategy is address(0)', async () => {
      await expect(
        CrabStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          underlying.address,
          weth.address,
          oSqth.address,
          constants.AddressZero, // crabStrategy
          crabNetting.address,
          swapRouter.address,
          oracle.address,
          usdcWethPool.address,
          wethOsqthPool.address,
        ),
      ).to.be.revertedWith('StrategyCrabStrategyCannotBe0Address');
    });

    it('reverts if the crab netting is address(0)', async () => {
      await expect(
        CrabStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          underlying.address,
          weth.address,
          oSqth.address,
          crabStrategyV2.address,
          constants.AddressZero, // crabNetting
          swapRouter.address,
          oracle.address,
          usdcWethPool.address,
          wethOsqthPool.address,
        ),
      ).to.be.revertedWith('StrategyCrabNettingCannotBe0Address');
    });

    it('reverts if the swap router is address(0)', async () => {
      await expect(
        CrabStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          underlying.address,
          weth.address,
          oSqth.address,
          crabStrategyV2.address,
          crabNetting.address,
          constants.AddressZero, // swapRouter
          oracle.address,
          usdcWethPool.address,
          wethOsqthPool.address,
        ),
      ).to.be.revertedWith('StrategySwapRouterCannotBe0Address');
    });

    it('reverts if the oracle is address(0)', async () => {
      await expect(
        CrabStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          underlying.address,
          weth.address,
          oSqth.address,
          crabStrategyV2.address,
          crabNetting.address,
          swapRouter.address,
          constants.AddressZero, // oracle
          usdcWethPool.address,
          wethOsqthPool.address,
        ),
      ).to.be.revertedWith('StrategyOracleCannotBe0Address');
    });

    it('reverts if the usdc-weth pool is address(0)', async () => {
      await expect(
        CrabStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          underlying.address,
          weth.address,
          oSqth.address,
          crabStrategyV2.address,
          crabNetting.address,
          swapRouter.address,
          oracle.address,
          constants.AddressZero, // usdcWethPool
          wethOsqthPool.address,
        ),
      ).to.be.revertedWith('StrategyUsdcWethPoolCannotBe0Address');
    });

    it('reverts if the weth-osqth pool is address(0)', async () => {
      await expect(
        CrabStrategyFactory.deploy(
          vault.address,
          admin.address,
          keeper.address,
          underlying.address,
          weth.address,
          oSqth.address,
          crabStrategyV2.address,
          crabNetting.address,
          swapRouter.address,
          oracle.address,
          usdcWethPool.address,
          constants.AddressZero, // wethOsqthPool
        ),
      ).to.be.revertedWith('StrategyWethOSqthPoolCannotBe0Address');
    });

    it('sets correct values', async () => {
      expect(await strategy.vault()).to.eq(vault.address);
      expect(await strategy.underlying()).to.eq(underlying.address);
      expect(await strategy.weth()).to.eq(weth.address);
      expect(await strategy.oSqth()).to.eq(oSqth.address);
      expect(await strategy.crabStrategyV2()).to.eq(crabStrategyV2.address);
      expect(await strategy.crabNetting()).to.eq(crabNetting.address);
      expect(await strategy.swapRouter()).to.eq(swapRouter.address);
      expect(await strategy.oracle()).to.eq(oracle.address);
      expect(await strategy.usdcWethPool()).to.eq(usdcWethPool.address);
      expect(await strategy.wethOSqthPool()).to.eq(wethOsqthPool.address);

      expect(await strategy.hasRole(KEEPER_ROLE, keeper.address)).to.be.true;
    });
  });

  describe('#isSync', () => {
    it('returns true', async () => {
      expect(await strategy.isSync()).to.be.true;
    });
  });

  describe('#invest', () => {
    it('reverts if caller is not manager', async () => {
      await expect(strategy.connect(admin).invest()).to.be.revertedWith(
        'StrategyCallerNotManager',
      );
    });

    it('emits StrategyDeposited event', async () => {
      let amount = parseUSDC('10000');
      await vault.connect(admin).deposit(
        depositParams.build({
          amount,
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(admin.address).build()],
        }),
      );

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);

      const tx = await vault.connect(admin).updateInvested(); // calls #invest

      expect(await underlying.balanceOf(strategy.address)).to.eq(amount);
      await expect(tx).to.emit(strategy, 'StrategyDeposited').withArgs(amount);
    });
  });

  describe('#investedAssets', () => {
    it('returns 0 if no assets are invested', async () => {
      expect(await strategy.investedAssets()).to.eq('0');
    });

    it('accounts for strategy usdc balance', async () => {
      let balance = parseUSDC('100');
      await underlying.mint(strategy.address, balance);

      expect(await strategy.investedAssets()).to.eq(balance);
    });

    it('accounts for strategy crab balance', async () => {
      // 1 crab = 1 eth collateral
      const collateral = parseUnits('100');
      const debt = parseUnits('50');
      await crabStrategyV2.initialize(debt, { value: collateral });
      await crabStrategyV2.transferCrab(strategy.address, parseUnits('100'));

      // total collateral - total debt = 100 - 50 = 50
      expect(await strategy.investedAssets()).to.eq(parseUSDC('50'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
    });

    it('accounts for queued usdc on netting contract', async () => {
      let balance = parseUSDC('100');
      await underlying.mint(strategy.address, balance);

      await strategy.queueUSDC(balance);

      expect(await strategy.investedAssets()).to.eq(balance);
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
    });

    it('accounts for queued crab for withdraw on netting contract', async () => {
      // 1 crab = 1 eth collateral
      const collateral = parseUnits('100');
      const debt = parseUnits('50');
      await crabStrategyV2.initialize(debt, { value: collateral });
      await crabStrategyV2.transferCrab(strategy.address, collateral);

      await strategy.queueCrab(collateral);

      expect(await strategy.investedAssets()).to.eq(parseUSDC('50'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq('0');
    });

    it('sums up amounts from balances and queued assets', async () => {
      const usdcBalance = parseUSDC('100');
      await underlying.mint(strategy.address, usdcBalance);
      await strategy.queueUSDC(usdcBalance.div(2));

      // 1 crab = 1 eth collateral
      const collateral = parseUnits('100');
      const debt = parseUnits('50');
      await crabStrategyV2.initialize(debt, { value: collateral });
      await crabStrategyV2.transferCrab(strategy.address, collateral);

      await strategy.queueCrab(collateral.div(2));

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );
      expect(await crabNetting.crabBalance(strategy.address)).to.eq(
        parseUnits('50'),
      );
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUSDC('50'),
      );
      expect(await crabNetting.usdBalance(strategy.address)).to.eq(
        parseUSDC('50'),
      );
      expect(await strategy.investedAssets()).to.eq(parseUSDC('150'));
    });
  });

  describe('#hasAssets', () => {
    it('returns false if no assets are invested', async () => {
      expect(await strategy.hasAssets()).to.be.false;
    });

    it('returns true if usdc balance > 0', async () => {
      await underlying.mint(strategy.address, parseUSDC('100'));

      expect(await strategy.hasAssets()).to.be.true;
    });

    it('returns true if crab balance > 0', async () => {
      await crabStrategyV2.initialize(20000, { value: parseUnits('100') });
      await crabStrategyV2.transferCrab(strategy.address, parseUnits('50'));

      expect(await strategy.hasAssets()).to.be.true;
    });

    it('returns true if queued usdc > 0', async () => {
      let balance = parseUSDC('100');
      await underlying.mint(strategy.address, balance);

      await strategy.queueUSDC(balance);

      expect(await strategy.hasAssets()).to.be.true;
    });

    it('returns true if queued crab > 0', async () => {
      await crabStrategyV2.initialize(20000, { value: parseUnits('100') });
      const crabAmount = parseUnits('50');
      await crabStrategyV2.transferCrab(strategy.address, crabAmount);

      await strategy.queueCrab(crabAmount);

      expect(await strategy.hasAssets()).to.be.true;
    });
  });

  describe('#withdrawToVault', () => {
    it('reverts if the caller is not manager', async () => {
      await expect(
        strategy.connect(admin).withdrawToVault(parseUSDC('100')),
      ).to.be.revertedWith('StrategyCallerNotManager');
    });

    it('reverts if the amount is 0', async () => {
      await expect(
        strategy.connect(manager).withdrawToVault(0),
      ).to.be.revertedWith('StrategyAmountZero');
    });

    it('withdraws from strategy usdc balance', async () => {
      let balance = parseUSDC('100');
      await underlying.mint(strategy.address, balance);

      await strategy.connect(manager).withdrawToVault(balance);

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await underlying.balanceOf(vault.address)).to.eq(balance);
    });

    it('withdraws from queued usdc deposit if usdc balance is 0', async () => {
      let balance = parseUSDC('100');
      await underlying.mint(strategy.address, balance);

      await strategy.queueUSDC(balance);

      await strategy.connect(manager).withdrawToVault(balance);

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await underlying.balanceOf(vault.address)).to.eq(balance);
    });

    it('withdraws the difference from queued usdc deposit if usdc balance < amount to withdraw', async () => {
      let initialBalance = parseUSDC('100');
      await underlying.mint(strategy.address, initialBalance);

      await strategy.queueUSDC(initialBalance.div(2));

      expect(await underlying.balanceOf(strategy.address)).to.eq(
        initialBalance.div(2),
      );
      expect(await crabNetting.usdBalance(strategy.address)).to.eq(
        initialBalance.div(2),
      );

      // withdraw 50 from balance and 30 from queued deposit
      const amountToWithdraw = parseUSDC('80');
      await strategy.connect(manager).withdrawToVault(amountToWithdraw);

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await underlying.balanceOf(vault.address)).to.eq(amountToWithdraw);
      expect(await crabNetting.usdBalance(strategy.address)).to.eq(
        parseUSDC('20'),
      );
    });
  });

  describe('#transferYield', () => {
    it("doesn't affect usdc balance", async () => {
      let initialBalance = parseUSDC('10000');
      await underlying.mint(strategy.address, initialBalance);

      await strategy.grantRole(MANAGER_ROLE, admin.address);

      await strategy.transferYield(admin.address, parseUSDC('1000'));

      expect(await underlying.balanceOf(strategy.address)).to.eq(
        initialBalance,
      );
      expect(await strategy.investedAssets()).to.eq(initialBalance);
    });
  });

  describe('#swapUsdcForEth', () => {
    it('reverts if the caller is not keeper', async () => {
      await expect(
        strategy
          .connect(admin)
          .swapUsdcForEth(parseUSDC('1000'), parseUnits('1')),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('reverts if the usdc balance is 0', async () => {
      await expect(
        strategy
          .connect(keeper)
          .swapUsdcForEth(parseUSDC('1000'), parseUnits('1')),
      ).to.be.revertedWith('StrategyNoUnderlying');
    });

    it('reverts if the usdc amount is 0', async () => {
      await underlying.mint(strategy.address, parseUSDC('10000'));

      await expect(
        strategy.connect(keeper).swapUsdcForEth(
          0, // amount
          parseUnits('1'),
        ),
      ).to.be.revertedWith('StrategyAmountZero');
    });

    it('reverts if the usdc amount is greater than balance', async () => {
      await underlying.mint(strategy.address, parseUSDC('10000'));
      const amount = await underlying.balanceOf(strategy.address);

      await expect(
        strategy.connect(keeper).swapUsdcForEth(
          amount.add(1), // > balance
          parseUnits('1'),
        ),
      ).to.be.revertedWith('StrategyAmountTooHigh');
    });

    it('executes the swap', async () => {
      await underlying.mint(strategy.address, parseUSDC('10000'));

      await swapRouter.setExchageRate(
        underlying.address,
        weth.address,
        parseUnits('0.001', '30'), // account for 12 decimals difference between USDC and ETH
      );

      await strategy
        .connect(keeper)
        .swapUsdcForEth(parseUSDC('1000'), parseUnits('1'));

      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUSDC('9000'),
      );
      expect(await strategy.investedAssets()).to.eq(parseUSDC('9000'));
      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('1'));
    });

    it('reverts if the amount out is less than min expeected', async () => {
      await underlying.mint(strategy.address, parseUSDC('10000'));

      await swapRouter.setExchageRate(
        underlying.address,
        weth.address,
        parseUnits('0.001', '30'), // account for 12 decimals difference between USDC and ETH
      );

      await expect(
        strategy
          .connect(keeper)
          .swapUsdcForEth(parseUSDC('1000'), parseUnits('1').add('1')),
      ).to.be.reverted;
    });
  });

  describe('#flashDeposit', () => {
    it('reverts if the caller is not keeper', async () => {
      await expect(
        strategy.connect(admin).flashDeposit(parseUnits('1'), parseUnits('1')),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('reverts if eth amount is greater than eth balance', async () => {
      const ethBalance = parseUnits('1');
      await setBalance(strategy.address, ethBalance);

      await expect(
        strategy
          .connect(keeper)
          .flashDeposit(ethBalance.add(1), parseUnits('1')),
      ).to.be.revertedWith('StrategyEthAmountTooHigh');
    });

    it('receives crab on sucessfull deposit', async () => {
      const ethBalance = parseUnits('1');
      const ethToBorrow = parseUnits('1');
      await setBalance(strategy.address, ethBalance);

      await strategy.connect(keeper).flashDeposit(ethBalance, ethToBorrow);

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        parseUnits('2'),
      );
      expect(await getETHBalance(strategy.address)).to.eq(0);
      console.log(
        'investedAssets',
        (await strategy.investedAssets()).toString(),
      );
      console.log(
        'crab balance',
        (await crabStrategyV2.balanceOf(strategy.address)).toString(),
      );
    });
  });

  describe('#flashWithdraw', () => {
    it('reverts if the caller is not keeper', async () => {
      await expect(
        strategy.connect(admin).flashWithdraw(parseUnits('1'), parseUnits('1')),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('reverts if the amount is 0', async () => {
      await expect(
        strategy.connect(keeper).flashWithdraw(0, parseUnits('1')),
      ).to.be.revertedWith('StrategyAmountZero');
    });

    it('reverts if the crab balance is 0', async () => {
      await expect(
        strategy
          .connect(keeper)
          .flashWithdraw(parseUnits('1'), parseUnits('1')),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('withdraws from the crab strategy', async () => {
      // initialize with 200% collateralization ratio
      await crabStrategyV2.initialize(parseUnits('5'), {
        value: parseUnits('10'),
      });

      const ethAmount = parseUnits('1');
      const ethToBorrow = parseUnits('1');
      await setBalance(strategy.address, ethAmount);

      await strategy.connect(keeper).flashDeposit(ethAmount, ethToBorrow);

      const crabBalance = await crabStrategyV2.balanceOf(strategy.address);

      const maxEthToRepayDebt = parseUnits('2');
      await strategy
        .connect(keeper)
        .flashWithdraw(crabBalance, maxEthToRepayDebt);

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(0);
      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('1'));
    });

    it('withdraws more if debt vaule reduces because short oSqth position generates value', async () => {
      await crabStrategyV2.initialize(parseUnits('5'), {
        value: parseUnits('10'),
      });

      console.log(
        'collateralization ratio',
        (await crabStrategyV2.getCollateralizationRatio()).toString(),
      );

      const ethAmount = parseUnits('1');
      const ethToBorrow = parseUnits('1');
      await setBalance(strategy.address, ethAmount);

      await strategy.connect(keeper).flashDeposit(ethAmount, ethToBorrow);

      const totalDebt = await crabStrategyV2.totalDebt();
      // reduce debt by 20%
      await crabStrategyV2.reduceDebt(totalDebt.div(5));

      console.log(
        'new collateralization ratio',
        (await crabStrategyV2.getCollateralizationRatio()).toString(),
      );

      const crabBalance = await crabStrategyV2.balanceOf(strategy.address);

      // max eth to repay debt should decerase by 20%
      const maxEthToRepayDebt = ethAmount.add(ethToBorrow).mul(5).div(4);
      await strategy
        .connect(keeper)
        .flashWithdraw(crabBalance, maxEthToRepayDebt);

      console.log(
        'ETH balance',
        (await getETHBalance(strategy.address)).toString(),
      );
    });
  });
});
