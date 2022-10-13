import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, utils } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';

import {
  ForkHelpers,
  generateNewAddress,
  moveForwardTwoWeeks,
  removeDecimals,
} from '../../shared';

import {
  Vault,
  ERC20,
  ERC20__factory,
  IRyskLiquidityPool,
  IRyskLiquidityPool__factory,
  RyskStrategy,
  Protocol,
  Protocol__factory,
  PortfolioValuesFeed,
  PortfolioValuesFeed__factory,
  Accounting,
  Accounting__factory,
} from '../../../typechain';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('Rysk Strategy (mainnet fork tests)', () => {
  let admin: SignerWithAddress;
  let ryskPoolKeeper: SignerWithAddress;

  let vault: Vault;
  let ryskLiquidityPool: IRyskLiquidityPool;
  let protocol: Protocol;
  let accounting: Accounting;
  let portfolioValuesFeed: PortfolioValuesFeed;
  let usdc: ERC20;
  let strategy: RyskStrategy;

  const TWO_WEEKS = time.duration.days(14).toNumber();
  const INVEST_PCT = 10000; // set 100% for test
  const INVESTMENT_FEE_PCT = 0; // set 0% for test
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  // mainnet addresses
  const RYSK_LIQUIDITY_POOL = '0xC10B976C671Ce9bFf0723611F01422ACbAe100A5';
  const RYSK_POOL_KEEPER = '0xfbde2e477ed031f54ed5ad52f35ee43cd82cf2a6';
  const USDC = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'; // collateral & strike asset of the pool
  // const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // underlying asset of the pool
  // const PROTOCOL = '0x08674f64DaC31f36828B63A4468A3AC3C68Db5B2', // protocol address
  // const ACCOUNTING = '0xd527BE017Be2C3d3d14D6bdF5C796E26bA0c5EE8', // accounting address
  // const PORTFOLIO_VALUES_FEED = '0x14eF340B33bD4f64C160E3bfcD2B84D67E9b33dF', // portfolio values feed address

  // fork block number had to be determined manually by trial and error
  // this is because liquidity pool uses oracles to detrmine the price of the collateral when calculating NAV (net asset value)
  // there is a time delta tolerance that is used to check if the prices are stale and that tolerance requires
  // the difference between timestamp of the price and the current block to be less than 600 ('maxTimeDeviationThreshold')
  const FORK_BLOCK = 27430441;

  beforeEach(async () => {
    await ForkHelpers.forkToArbitrumMainnet(FORK_BLOCK);

    [admin] = await ethers.getSigners();

    ryskLiquidityPool = IRyskLiquidityPool__factory.connect(
      RYSK_LIQUIDITY_POOL,
      admin,
    );

    usdc = ERC20__factory.connect(USDC, admin);

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      usdc.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      admin.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    const RyskStrategyFactory = await ethers.getContractFactory('RyskStrategy');

    strategy = await RyskStrategyFactory.deploy(
      vault.address,
      admin.address,
      admin.address,
      RYSK_LIQUIDITY_POOL,
      usdc.address,
    );

    await vault.setStrategy(strategy.address);

    await usdc.connect(admin).approve(vault.address, MaxUint256);
    await strategy.connect(admin).grantRole(MANAGER_ROLE, admin.address);

    await ForkHelpers.impersonate([RYSK_POOL_KEEPER]);
    ryskPoolKeeper = await ethers.getSigner(RYSK_POOL_KEEPER);
    await ForkHelpers.setBalance(RYSK_POOL_KEEPER, parseUnits('1'));
  });

  describe('invest', () => {
    it('deposits into liquidity pool', async () => {
      const amount = parseUnits('1000', 6);
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      expect(await strategy.hasAssets()).to.be.true;
      expect(await strategy.investedAssets()).to.eq(amount);
      expect(await ryskLiquidityPool.balanceOf(strategy.address)).to.eq('0');

      const depositReceipt = await ryskLiquidityPool.depositReceipts(
        strategy.address,
      );
      expect(depositReceipt.amount).to.eq(amount);
      expect(depositReceipt.unredeemedShares).to.eq('0');
    });

    it('can be called multiple times in the same epoch', async () => {
      const amount = parseUnits('1000', 6);

      await ForkHelpers.mintToken(usdc, strategy.address, amount);
      await strategy.connect(admin).invest();

      await ForkHelpers.mintToken(usdc, strategy.address, amount);
      await strategy.connect(admin).invest();

      expect(await strategy.hasAssets()).to.be.true;
      expect(await strategy.investedAssets()).to.eq(amount.mul(2));
    });

    it('can be called multiple times in the different epoch', async () => {
      const amount = parseUnits('1000', 6);
      await ForkHelpers.mintToken(usdc, strategy.address, amount);
      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await ForkHelpers.mintToken(usdc, strategy.address, amount);
      await strategy.connect(admin).invest();

      expect(await strategy.hasAssets()).to.be.true;
      expect(await strategy.investedAssets()).to.eq('1999999999');
      expect(await ryskLiquidityPool.balanceOf(strategy.address)).to.eq('0');
    });
  });

  describe('withdrawToVault', () => {
    it('initiates a withdrawal from liquidity pool', async () => {
      const amount = parseUnits('1000', 6);
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(parseUnits('500', 6));

      const depositReceipt = await ryskLiquidityPool.depositReceipts(
        strategy.address,
      );
      expect(depositReceipt.amount).to.eq('0');
      expect(depositReceipt.unredeemedShares).to.eq('0');

      expect(await strategy.hasAssets()).to.be.true;
      expect(await strategy.investedAssets()).to.gte('999999995');
    });

    it('can initiate a withdrawal for amount returned by investedAssets()', async () => {
      const amount = parseUnits('1000', 6);
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      const invested = await strategy.investedAssets();
      await strategy.connect(admin).withdrawToVault(invested);

      const depositReceipt = await ryskLiquidityPool.depositReceipts(
        strategy.address,
      );
      expect(depositReceipt.amount).to.eq('0');
      expect(depositReceipt.unredeemedShares).to.eq('0');

      expect(await strategy.hasAssets()).to.be.true;
      expect(await strategy.investedAssets()).to.gte('999999995');
    });

    it('can be called multiple times in the same epoch', async () => {
      const amount = parseUnits('1000', 6);
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(amount.div(2));
      await strategy.connect(admin).withdrawToVault(amount.div(2));

      expect(await strategy.hasAssets()).to.be.true;
      expect(await strategy.investedAssets()).to.gte('999999995');
    });

    it('fails if called without completing withdrawal from previous epoch', async () => {
      const amount = parseUnits('1000', 6);
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(amount.div(2));

      await executeEpochCalculation();

      await expect(strategy.connect(admin).withdrawToVault(amount.div(2))).to.be
        .reverted;
    });
  });

  describe('completeWithdrawal', async () => {
    it('completes an initiated withdrawal from the liquidity pool', async () => {
      const amount = parseUnits('1000', 6);
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(parseUnits('500', 6));

      await executeEpochCalculation();

      await strategy.connect(admin).completeWithdrawal();

      expect(await usdc.balanceOf(vault.address)).to.gte('499999500');
      expect(await usdc.balanceOf(strategy.address)).to.eq(0);
      expect(await strategy.investedAssets()).to.gte('499999500');
    });

    it('withdaws more if yield is generated in the liquidity pool', async () => {
      const amount = parseUnits('1000', 6);
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(parseUnits('500', 6));

      // generate ~10% yield
      const poolBalance = await usdc.balanceOf(ryskLiquidityPool.address);
      await ForkHelpers.mintToken(
        usdc,
        ryskLiquidityPool.address,
        poolBalance.div(10),
      );

      await executeEpochCalculation();

      await strategy.connect(admin).completeWithdrawal();

      expect(await usdc.balanceOf(vault.address)).to.gte('546514000');
      expect(await usdc.balanceOf(strategy.address)).to.eq(0);
      expect(await strategy.investedAssets()).to.gte('546514000');
    });
  });

  describe('debugging...', () => {
    it('only nav', async () => {
      console.log(
        'epoch at fork block',
        FORK_BLOCK,
        await ryskLiquidityPool.connect(admin).depositEpoch(),
      );

      console.log('nav', await ryskLiquidityPool.getNAV());
    });

    // failing at 217 Accounting.sol, withdrawal amount == 0 is true
    it('nav and 2 epochs', async () => {
      console.log('nav', await ryskLiquidityPool.getNAV());

      const amount = parseUnits('1000', 6);
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();
      console.log('invested');

      await executeEpochCalculation();

      console.log('nav', await ryskLiquidityPool.getNAV());

      console.log(
        'epoch',
        await ryskLiquidityPool.connect(admin).withdrawalEpoch(),
      );
      console.log(
        'epoch pps',
        await ryskLiquidityPool.withdrawalEpochPricePerShare(
          (await ryskLiquidityPool.withdrawalEpoch()).sub(1),
        ),
      );

      await strategy.connect(admin).withdrawToVault(amount);
      console.log('withdrawal intiated');

      console.log('invested assets', await strategy.investedAssets());
      // 999 999999999999999999

      const receipt = await ryskLiquidityPool.withdrawalReceipts(
        strategy.address,
      );
      console.log('withdrawal receipt', receipt);

      await executeEpochCalculation();

      const receipt2 = await ryskLiquidityPool.withdrawalReceipts(
        strategy.address,
      );
      console.log('withdrawal receipt2', receipt);

      console.log(
        'new epoch',
        await ryskLiquidityPool.connect(admin).withdrawalEpoch(),
      );
      const newPps = await ryskLiquidityPool.withdrawalEpochPricePerShare(
        (await ryskLiquidityPool.withdrawalEpoch()).sub(1),
      );
      console.log('new epoch pps', newPps);
      // 1 001141479816023623

      console.log('nav', await ryskLiquidityPool.getNAV());

      accounting = await Accounting__factory.connect(
        '0xd527be017be2c3d3d14d6bdf5c796e26ba0c5ee8',
        admin,
      );

      // had to check but this shit returns 0 for receipt.shares for some reason and it reverts
      const accountingAmount = await accounting.amountForShares(
        receipt.shares,
        newPps,
      );

      console.log('accounting amount', accountingAmount);

      // const accountingCompleteWithdraw = await accounting.completeWithdraw(
      //   strategy.address,
      // );
      // console.log('accounting complete withdraw', accountingCompleteWithdraw);

      console.log('completing withdrawal');
      await strategy.completeWithdrawal();
      console.log('withdrawal completed');

      console.log('vault balance', await usdc.balanceOf(vault.address));
    });

    it('assets & liablities', async () => {
      const assets = await ryskLiquidityPool.getAssets();
      console.log('assets', assets);

      protocol = Protocol__factory.connect(
        await ryskLiquidityPool.protocol(),
        admin,
      );

      portfolioValuesFeed = PortfolioValuesFeed__factory.connect(
        await protocol.portfolioValuesFeed(),
        admin,
      );

      const portfolioValues = await portfolioValuesFeed.getPortfolioValues(
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH underlying
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC strike asset
      );

      const liablities = portfolioValues.callPutsValue.add(
        await ryskLiquidityPool.ephemeralLiabilities(),
      );
      console.log('liablities', liablities);

      console.log('nav', await assets.sub(liablities));

      console.log('portfolio values timestamp', portfolioValues.timestamp);

      console.log(
        'block timestamp',
        (await ethers.provider.getBlock(FORK_BLOCK)).timestamp,
      );

      console.log(
        'time delta',
        (await ethers.provider.getBlock(FORK_BLOCK)).timestamp -
          portfolioValues.timestamp.toNumber(),
      );
    });

    it('is keeper', async () => {
      console.log(
        'is admin keeper',
        await ryskLiquidityPool.keeper(admin.address),
      );

      console.log(
        'is governor keeper',
        await ryskLiquidityPool.keeper(ryskPoolKeeper.address),
      );

      await ryskLiquidityPool
        .connect(ryskPoolKeeper)
        .setKeeper(admin.address, true);

      console.log(
        'is admin keeper',
        await ryskLiquidityPool.keeper(admin.address),
      );
    });
  });

  async function executeEpochCalculation() {
    await ryskLiquidityPool.connect(ryskPoolKeeper).pauseTradingAndRequest();
    await ryskLiquidityPool
      .connect(ryskPoolKeeper)
      // has to have explicit gas limit since hardhat is not able to estimate gas for this call
      .executeEpochCalculation({ gasLimit: 5_000_000 });
  }
});
