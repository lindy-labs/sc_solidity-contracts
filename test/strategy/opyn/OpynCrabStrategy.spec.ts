import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { ethers } from 'hardhat';
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

import { generateNewAddress, getETHBalance, parseUSDC } from '../../shared/';
import { depositParams, claimParams } from '../../shared/factories';
import { setBalance } from '../../shared/forkHelpers';

const { parseUnits } = ethers.utils;

describe('OpynCrabStrategy', () => {
  let admin: SignerWithAddress;
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

  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));
  const KEEPER_ROLE = utils.keccak256(utils.toUtf8Bytes('KEEPER_ROLE'));

  beforeEach(async () => {
    [admin, keeper, manager] = await ethers.getSigners();

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

    await swapRouter.setExchageRate(
      weth.address,
      underlying.address,
      parseUnits('1', '6'), // account for 12 decimals difference between USDC and ETH
    );

    await swapRouter.setExchageRate(
      underlying.address,
      weth.address,
      parseUnits('1', '30'),
    );

    const MockOracle = await ethers.getContractFactory('MockOracle');
    oracle = await MockOracle.deploy();

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      underlying.address,
      BigNumber.from(time.duration.weeks(2).toNumber()), // lockPeriod
      BigNumber.from('10000'), // investPct
      generateNewAddress(), // treasury
      admin.address,
      BigNumber.from('0'), // performanceFeePct
      BigNumber.from('0'), // managementFeePct
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

    it('emits StrategyInvested event', async () => {
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
      await expect(tx).to.emit(strategy, 'StrategyInvested').withArgs(amount);
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
      // 1 crab = 2 eth collateral
      const collateral = parseUnits('100');
      const debt = parseUnits('50');
      await crabStrategyV2.initialize(debt, { value: collateral });
      await crabStrategyV2.transferCrab(strategy.address, parseUnits('50'));

      // total collateral - total debt = 100 - 50 = 50
      expect(await strategy.investedAssets()).to.eq(parseUSDC('50'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
    });

    it('accounts for queued usdc on netting contract', async () => {
      let balance = parseUSDC('100');
      await underlying.mint(strategy.address, balance);

      await strategy.connect(keeper).queueUSDC(balance);

      expect(await strategy.investedAssets()).to.eq(balance);
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
    });

    it('accounts for queued crab for withdraw on netting contract', async () => {
      // 1 crab = 2 eth collateral
      const collateral = parseUnits('100');
      const debt = parseUnits('50');
      await crabStrategyV2.initialize(debt, { value: collateral });
      await crabStrategyV2.transferCrab(strategy.address, collateral.div(2));

      await strategy.connect(keeper).queueCrab(collateral.div(2));

      expect(await strategy.investedAssets()).to.eq(parseUSDC('50'));
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq('0');
    });

    it('sums up amounts from balances and queued assets', async () => {
      const usdcBalance = parseUSDC('100');
      await underlying.mint(strategy.address, usdcBalance);
      await strategy.connect(keeper).queueUSDC(usdcBalance.div(2));

      // 1 crab = 2 eth collateral
      const collateral = parseUnits('100');
      const debt = parseUnits('50');
      await crabStrategyV2.initialize(debt, { value: collateral });
      await crabStrategyV2.transferCrab(strategy.address, collateral.div(2));

      const crabBalance = await crabStrategyV2.balanceOf(strategy.address);
      await strategy.connect(keeper).queueCrab(crabBalance.div(2));

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        parseUnits('25'),
      );
      expect(await crabNetting.crabBalance(strategy.address)).to.eq(
        parseUnits('25'),
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

      await strategy.connect(keeper).queueUSDC(balance);

      expect(await strategy.hasAssets()).to.be.true;
    });

    it('returns true if queued crab > 0', async () => {
      await crabStrategyV2.initialize(20000, { value: parseUnits('100') });
      const crabAmount = parseUnits('50');
      await crabStrategyV2.transferCrab(strategy.address, crabAmount);

      await strategy.connect(keeper).queueCrab(crabAmount);

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

    it('reverts if amount is greater than invested assets', async () => {
      await expect(
        strategy.connect(manager).withdrawToVault(1),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('withdraws from strategy usdc balance', async () => {
      let balance = parseUSDC('100');
      await underlying.mint(strategy.address, balance);

      const tx = await strategy.connect(manager).withdrawToVault(balance);

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await underlying.balanceOf(vault.address)).to.eq(balance);
      await expect(tx).to.emit(strategy, 'StrategyWithdrawn').withArgs(balance);
    });

    it('withdraws from queued usdc deposit if usdc balance is 0', async () => {
      let balance = parseUSDC('100');
      await underlying.mint(strategy.address, balance);

      await strategy.connect(keeper).queueUSDC(balance);

      const tx = await strategy.connect(manager).withdrawToVault(balance);

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await underlying.balanceOf(vault.address)).to.eq(balance);
      await expect(tx).to.emit(strategy, 'StrategyWithdrawn').withArgs(balance);
    });

    it('withdraws the difference from queued usdc deposit if usdc balance < amount to withdraw', async () => {
      let initialBalance = parseUSDC('100');
      await underlying.mint(strategy.address, initialBalance);

      await strategy.connect(keeper).queueUSDC(initialBalance.div(2));

      expect(await underlying.balanceOf(strategy.address)).to.eq(
        initialBalance.div(2),
      );
      expect(await crabNetting.usdBalance(strategy.address)).to.eq(
        initialBalance.div(2),
      );

      // withdraw 50 from balance and 30 from queued deposit
      const amountToWithdraw = parseUSDC('80');
      const tx = await strategy
        .connect(manager)
        .withdrawToVault(amountToWithdraw);

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await underlying.balanceOf(vault.address)).to.eq(amountToWithdraw);
      expect(await crabNetting.usdBalance(strategy.address)).to.eq(
        parseUSDC('20'),
      );
      await expect(tx)
        .to.emit(strategy, 'StrategyWithdrawn')
        .withArgs(amountToWithdraw);
    });

    it('withdraws from crab if usdc balance and queued deposit are 0', async () => {
      await crabStrategyV2.initialize(parseUnits('100'), {
        value: parseUnits('200'),
      });
      await crabStrategyV2.transferCrab(strategy.address, parseUnits('100'));

      await strategy.connect(manager).withdrawToVault(parseUSDC('50'));

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await underlying.balanceOf(vault.address)).to.eq(parseUSDC('50'));
      expect(await strategy.investedAssets()).to.eq(parseUSDC('50'));
    });

    it("withraws from queued crab if crab balance isn't enough", async () => {
      await crabStrategyV2.initialize(parseUnits('100'), {
        value: parseUnits('200'),
      });
      await crabStrategyV2.transferCrab(strategy.address, parseUnits('100'));
      await strategy.connect(keeper).queueCrab(parseUnits('50'));

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        parseUnits('50'),
      );
      expect(await crabNetting.crabBalance(strategy.address)).to.eq(
        parseUnits('50'),
      );

      await strategy.connect(manager).withdrawToVault(parseUSDC('100'));

      expect(await underlying.balanceOf(vault.address)).to.eq(parseUSDC('100'));
      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(0);
      expect(await crabNetting.crabBalance(strategy.address)).to.eq(0);
    });

    it('withdraws from queued crab as last option', async () => {
      let initialBalance = parseUSDC('1000');
      await underlying.mint(strategy.address, initialBalance);

      await strategy.connect(keeper).queueUSDC(initialBalance.div(4));
      await strategy
        .connect(keeper)
        .flashDeposit(
          initialBalance.div(2),
          parseUnits('500'),
          parseUnits('500'),
        );
      await strategy.connect(keeper).queueCrab(parseUnits('250'));

      expect(await underlying.balanceOf(strategy.address)).to.eq(
        initialBalance.div(4),
      );
      expect(await crabNetting.usdBalance(strategy.address)).to.eq(
        initialBalance.div(4),
      );
      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        parseUnits('250'),
      );
      expect(await crabNetting.crabBalance(strategy.address)).to.eq(
        parseUnits('250'),
      );
      expect(await strategy.investedAssets()).to.eq(initialBalance);

      // withdraw 3/4 of initial balance leving invested in crab 1/4 of initial balance
      const amountToWithdraw = initialBalance.mul(3).div(4);
      const tx = await strategy
        .connect(manager)
        .withdrawToVault(amountToWithdraw);

      expect(await crabNetting.crabBalance(strategy.address)).to.eq(
        parseUnits('250'),
      );
      expect(await underlying.balanceOf(vault.address)).to.eq(amountToWithdraw);
      expect(await strategy.investedAssets()).to.eq(initialBalance.div(4));

      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
      expect(await crabNetting.usdBalance(strategy.address)).to.eq(0);
      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(0);

      await expect(tx)
        .to.emit(strategy, 'StrategyWithdrawn')
        .withArgs(amountToWithdraw);
    });
  });

  describe('#getCrabFairPrice', async () => {
    it('returns price of 1 crab in usdc with 18 decimals precision', async () => {
      await crabStrategyV2.initialize(parseUnits('100'), {
        value: parseUnits('200'),
      });

      const crabPrice = await strategy.getCrabFairPrice();

      expect(crabPrice).to.eq(parseUnits('1'));
    });

    it('accounts for eth/usdc price', async () => {
      // set weth/usdc
      await oracle.setExchageRate(
        weth.address,
        underlying.address,
        parseUnits('1500'),
      );

      // mock mits 1 crab per 2 eth
      // initialize to 15 crab and sqeeth debt in value of 10 eth collateralized with 30 eth
      await crabStrategyV2.initialize(parseUnits('10'), {
        value: parseUnits('30'),
      });

      // since debt vaule is 10 eth, 20 eth is for overcollateralization
      // expected price is 20 eth / 15 crab = 4/3 eth per crab = 4/3 * 1500 usdc per crab
      expect(await strategy.getCrabFairPrice()).to.eq(parseUnits('2000'));
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

  describe('#flashDeposit', () => {
    it('reverts if the caller is not keeper', async () => {
      await expect(
        strategy.connect(admin).flashDeposit(0, 0, 0),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('reverts if the usdc balance is 0', async () => {
      await expect(
        strategy
          .connect(keeper)
          .flashDeposit(parseUSDC('1000'), parseUnits('1'), parseUnits('1')),
      ).to.be.revertedWith('StrategyNoUnderlying');
    });

    it('reverts if the usdc amount is 0', async () => {
      await underlying.mint(strategy.address, parseUSDC('10000'));

      await expect(
        strategy.connect(keeper).flashDeposit(
          0, // amount
          parseUnits('1'),
          parseUnits('1'),
        ),
      ).to.be.revertedWith('StrategyAmountZero');
    });

    it('reverts if the usdc amount is greater than balance', async () => {
      await underlying.mint(strategy.address, parseUSDC('10000'));
      const amount = await underlying.balanceOf(strategy.address);

      await expect(
        strategy.connect(keeper).flashDeposit(
          amount.add(1), // > balance
          parseUnits('1'),
          parseUnits('1'),
        ),
      ).to.be.revertedWith('StrategyAmountTooHigh');
    });

    it('reverts if the crab strategy collateral cap is reached', async () => {
      const usdcAmount = parseUSDC('100');
      const ethAmountOutMin = parseUnits('100');
      const ethToBorrow = parseUnits('100');
      await underlying.mint(strategy.address, usdcAmount);

      await crabStrategyV2.setCollateralCap(parseUnits('100'));

      // 200 eth being deposited > 100 collateral cap
      await expect(
        strategy
          .connect(keeper)
          .flashDeposit(usdcAmount, ethAmountOutMin, ethToBorrow),
      ).to.be.revertedWith('StrategyCollateralCapReached');
    });

    it('receives crab on sucessfull deposit', async () => {
      const usdcAmount = parseUSDC('100');
      const ethAmountOutMin = parseUnits('100');
      const ethToBorrow = parseUnits('100');
      await underlying.mint(strategy.address, usdcAmount);

      await strategy
        .connect(keeper)
        .flashDeposit(usdcAmount, ethAmountOutMin, ethToBorrow);

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        parseUnits('100'),
      );
      expect(await getETHBalance(strategy.address)).to.eq(0);
    });

    it('swaps eth leftovers after flash deposit into usdc', async () => {
      // with this setup we expect 5 eth leftovers after flash deposit
      const usdcAmount = parseUSDC('100');
      const ethAmountOutMin = parseUnits('100');
      const ethToBorrow = parseUnits('90');
      await underlying.mint(strategy.address, usdcAmount);

      await strategy
        .connect(keeper)
        .flashDeposit(usdcAmount, ethAmountOutMin, ethToBorrow);

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        parseUnits('95'),
      );
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUSDC('5'),
      );
      expect(await getETHBalance(strategy.address)).to.eq(0);
    });
  });

  describe('#flashWithdraw', () => {
    it('reverts if the caller is not keeper', async () => {
      await expect(
        strategy
          .connect(admin)
          .flashWithdraw(parseUnits('1'), parseUnits('1'), 0),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('reverts if the amount is 0', async () => {
      await expect(
        strategy.connect(keeper).flashWithdraw(0, parseUnits('1'), 0),
      ).to.be.revertedWith('StrategyAmountZero');
    });

    it('reverts if the crab balance is 0', async () => {
      await expect(
        strategy
          .connect(keeper)
          .flashWithdraw(parseUnits('1'), parseUnits('1'), 0),
      ).to.be.revertedWith('StrategyNotEnoughShares');
    });

    it('withdraws from the crab strategy', async () => {
      const usdcAmount = parseUSDC('10');
      const ethAmount = parseUnits('10');
      const ethToBorrow = parseUnits('10');
      await underlying.mint(strategy.address, usdcAmount);
      await crabStrategyV2.initialize(parseUnits('50'), {
        value: parseUnits('100'),
      });

      await strategy
        .connect(keeper)
        .flashDeposit(usdcAmount, ethAmount, ethToBorrow);

      const crabBalance = await crabStrategyV2.balanceOf(strategy.address);
      const maxEthToRepayDebt = parseUnits('10');

      await strategy
        .connect(keeper)
        .flashWithdraw(crabBalance, maxEthToRepayDebt, 0);

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(0);
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUSDC('10'),
      );
    });

    it('withdraws more if debt vaule reduces because short oSqth position generates value', async () => {
      const usdcAmount = parseUSDC('10');
      const ethAmount = parseUnits('10');
      const ethToBorrow = parseUnits('10');
      await underlying.mint(strategy.address, usdcAmount);
      await crabStrategyV2.initialize(parseUnits('50'), {
        value: parseUnits('100'),
      });

      await strategy
        .connect(keeper)
        .flashDeposit(usdcAmount, ethAmount, ethToBorrow);

      const totalDebt = await crabStrategyV2.totalDebt();
      // reduce debt by 20%
      await crabStrategyV2.reduceDebt(totalDebt.div(5));

      const crabBalance = await crabStrategyV2.balanceOf(strategy.address);

      // max eth to repay debt should decerase by 20%
      const maxEthToRepayDebt = ethAmount.add(ethToBorrow).mul(5).div(4);
      await strategy
        .connect(keeper)
        .flashWithdraw(crabBalance, maxEthToRepayDebt, 0);
    });
  });

  describe('#queueUSDC', () => {
    it('reverts if the caller is not keeper', async () => {
      await expect(
        strategy.connect(admin).queueUSDC(parseUSDC('1')),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('reverts if the amount is 0', async () => {
      await expect(strategy.connect(keeper).queueUSDC(0)).to.be.revertedWith(
        'StrategyAmountZero',
      );
    });

    it('reverts if the amount is greater than balance', async () => {
      await underlying.mint(strategy.address, parseUSDC('1'));

      await expect(
        strategy.connect(keeper).queueUSDC(parseUSDC('2')),
      ).to.be.revertedWith('StrategyAmountTooHigh');
    });

    it('queues the usdc', async () => {
      await underlying.mint(strategy.address, parseUSDC('1'));

      await strategy.connect(keeper).queueUSDC(parseUSDC('1'));

      expect(await crabNetting.usdBalance(strategy.address)).to.eq(
        parseUSDC('1'),
      );
      expect(await underlying.balanceOf(strategy.address)).to.eq(0);
    });
  });

  describe('#dequeueUSDC', () => {
    it('reverts if the caller is not keeper', async () => {
      await expect(
        strategy.connect(admin).dequeueUSDC(parseUSDC('1')),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('reverts if the amount is 0', async () => {
      await expect(strategy.connect(keeper).dequeueUSDC(0)).to.be.revertedWith(
        'StrategyAmountZero',
      );
    });

    it('reverts if the amount is greater than balance', async () => {
      await underlying.mint(strategy.address, parseUSDC('1'));
      await strategy.connect(keeper).queueUSDC(parseUSDC('1'));

      await expect(
        strategy.connect(keeper).dequeueUSDC(parseUSDC('2')),
      ).to.be.revertedWith('StrategyAmountTooHigh');
    });

    it('dequeues the usdc', async () => {
      await underlying.mint(strategy.address, parseUSDC('1'));
      await strategy.connect(keeper).queueUSDC(parseUSDC('1'));

      await strategy.connect(keeper).dequeueUSDC(parseUSDC('1'));

      expect(await crabNetting.usdBalance(strategy.address)).to.eq(0);
      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUSDC('1'),
      );
    });
  });

  describe('#queueCrab', () => {
    it('reverts if the caller is not keeper', async () => {
      await expect(
        strategy.connect(admin).queueCrab(parseUnits('1')),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('reverts if the amount is 0', async () => {
      await expect(strategy.connect(keeper).queueCrab(0)).to.be.revertedWith(
        'StrategyAmountZero',
      );
    });

    it('reverts if the amount is greater than crab balance', async () => {
      await crabStrategyV2.initialize(parseUnits('5'), {
        value: parseUnits('10'),
      });
      await crabStrategyV2.transferCrab(strategy.address, parseUnits('1'));

      await expect(
        strategy.connect(keeper).queueCrab(parseUnits('2')),
      ).to.be.revertedWith('StrategyAmountTooHigh');
    });

    it('queues the crab amount', async () => {
      await crabStrategyV2.initialize(parseUnits('5'), {
        value: parseUnits('10'),
      });
      await crabStrategyV2.transferCrab(strategy.address, parseUnits('1'));

      await strategy.connect(keeper).queueCrab(parseUnits('1'));

      expect(await crabNetting.crabBalance(strategy.address)).to.eq(
        parseUnits('1'),
      );
      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(0);
    });
  });

  describe('#dequeueCrab', () => {
    it('reverts if the caller is not keeper', async () => {
      await expect(
        strategy.connect(admin).dequeueCrab(parseUnits('1')),
      ).to.be.revertedWith('StrategyCallerNotKeeper');
    });

    it('reverts if the amount is 0', async () => {
      await expect(strategy.connect(keeper).dequeueCrab(0)).to.be.revertedWith(
        'StrategyAmountZero',
      );
    });

    it('reverts if the amount is greater than balance', async () => {
      await crabStrategyV2.initialize(parseUnits('5'), {
        value: parseUnits('10'),
      });
      await crabStrategyV2.transferCrab(strategy.address, parseUnits('1'));
      await strategy.connect(keeper).queueCrab(parseUnits('1'));

      await expect(
        strategy.connect(keeper).dequeueCrab(parseUnits('2')),
      ).to.be.revertedWith('StrategyAmountTooHigh');
    });

    it('dequeues the crab amount', async () => {
      await crabStrategyV2.initialize(parseUnits('5'), {
        value: parseUnits('10'),
      });
      await crabStrategyV2.transferCrab(strategy.address, parseUnits('1'));
      await strategy.connect(keeper).queueCrab(parseUnits('1'));

      await strategy.connect(keeper).dequeueCrab(parseUnits('1'));

      expect(await crabNetting.crabBalance(strategy.address)).to.eq(0);
      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        parseUnits('1'),
      );
    });
  });
});
