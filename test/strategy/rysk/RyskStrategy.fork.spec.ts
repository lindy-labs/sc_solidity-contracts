import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';

import { ForkHelpers, generateNewAddress, parseUSDC } from '../../shared';

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
  const ACCOUNTING = '0xd527BE017Be2C3d3d14D6bdF5C796E26bA0c5EE8'; // accounting address
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

  describe('#invest', () => {
    it('deposits into liquidity pool', async () => {
      const amount = parseUSDC('1000');
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
      const amount = parseUSDC('1000');

      await ForkHelpers.mintToken(usdc, strategy.address, amount);
      await strategy.connect(admin).invest();

      await ForkHelpers.mintToken(usdc, strategy.address, amount);
      await strategy.connect(admin).invest();

      expect(await strategy.hasAssets()).to.be.true;
      expect(await strategy.investedAssets()).to.eq(amount.mul(2));
    });

    it('can be called multiple times in the different epochs', async () => {
      const amount = parseUSDC('1000');
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

  describe('#withdrawToVault', () => {
    it('initiates a withdrawal from liquidity pool', async () => {
      const amount = parseUSDC('1000');
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(parseUSDC('500'));

      const depositReceipt = await ryskLiquidityPool.depositReceipts(
        strategy.address,
      );
      expect(depositReceipt.amount).to.eq('0');
      expect(depositReceipt.unredeemedShares).to.eq('0');

      expect(await strategy.hasAssets()).to.be.true;
      // have to use gte because of the changing rounding errors
      expect(await strategy.investedAssets()).to.gte('999999995');
    });

    it('can initiate a withdrawal for amount returned by investedAssets()', async () => {
      const amount = parseUSDC('1000');
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
      // have to use gte because of changing rounding errors
      expect(await strategy.investedAssets()).to.gte('999999995');
    });

    it('can be called multiple times in the same epoch', async () => {
      const amount = parseUSDC('1000');
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(amount.div(2));
      await strategy.connect(admin).withdrawToVault(amount.div(2));

      expect(await strategy.hasAssets()).to.be.true;
      // have to use gte because of the changing rounding errors
      expect(await strategy.investedAssets()).to.gte('999999995');
    });

    it('fails if called without completing withdrawal from previous epoch', async () => {
      const amount = parseUSDC('1000');
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(amount.div(2));

      await executeEpochCalculation();

      await expect(strategy.connect(admin).withdrawToVault(amount.div(2))).to.be
        .reverted;
    });
  });

  describe('#completeWithdrawal', async () => {
    it('completes an initiated withdrawal from the liquidity pool', async () => {
      const amount = parseUSDC('1000');
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(parseUSDC('500'));

      await executeEpochCalculation();

      await strategy.connect(admin).completeWithdrawal();

      // have to use gte because of the changing rounding errors
      expect(await usdc.balanceOf(vault.address)).to.gte('499999500');
      expect(await usdc.balanceOf(strategy.address)).to.eq(0);
      expect(await strategy.investedAssets()).to.gte('499999500');
    });

    it('withdaws more if yield is generated in the liquidity pool', async () => {
      const amount = parseUSDC('1000');
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(parseUSDC('500'));

      // generate ~10% yield
      const poolBalance = await usdc.balanceOf(ryskLiquidityPool.address);
      await ForkHelpers.mintToken(
        usdc,
        ryskLiquidityPool.address,
        poolBalance.div(10),
      );

      await executeEpochCalculation();

      await strategy.connect(admin).completeWithdrawal();

      // have to use gte because of the changing rounding errors
      expect(await usdc.balanceOf(vault.address)).to.gte('546514000');
      expect(await usdc.balanceOf(strategy.address)).to.eq(0);
      expect(await strategy.investedAssets()).to.gte('546514000');
    });
  });

  describe('#investedAssets', () => {
    it('accounts for share price appreciation after deposit', async () => {
      const amount = parseUSDC('1000');
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      // generate ~20% yield
      const poolBalance = await usdc.balanceOf(ryskLiquidityPool.address);
      await ForkHelpers.mintToken(
        usdc,
        ryskLiquidityPool.address,
        poolBalance.div(5),
      );

      await executeEpochCalculation();

      expect(await strategy.investedAssets()).to.gte('1186057000');
    });

    it("doesn't account for share price appreciation after withdrawal is initiated", async () => {
      const amount = parseUSDC('1000');
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(amount);

      await executeEpochCalculation();

      // generate ~20% yield
      const poolBalance = await usdc.balanceOf(ryskLiquidityPool.address);
      await ForkHelpers.mintToken(
        usdc,
        ryskLiquidityPool.address,
        poolBalance.div(5),
      );

      await executeEpochCalculation();

      expect(await strategy.investedAssets()).to.lte(amount);
    });

    it('works when investing and withdrawing in the same epoch', async () => {
      const amount = parseUSDC('1000');
      await ForkHelpers.mintToken(usdc, strategy.address, amount);

      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      // generate ~20% yield
      const poolBalance = await usdc.balanceOf(ryskLiquidityPool.address);
      await ForkHelpers.mintToken(
        usdc,
        ryskLiquidityPool.address,
        poolBalance.div(5),
      );

      await executeEpochCalculation();

      await strategy.connect(admin).withdrawToVault(amount);

      await ForkHelpers.mintToken(usdc, strategy.address, amount);
      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await strategy.connect(admin).completeWithdrawal();

      // we gained ~20 before withdraw, withdrawn 1000 USDC to vault, and invested another 1000 USDC
      expect(await usdc.balanceOf(vault.address)).to.gte('999999000');
      expect(await strategy.investedAssets()).to.gte('1186057000');
    });

    it('correctly summs amounts for pending deposit, pending withdrawal, unredeemed and redeemed shares ', async () => {
      // scenario:
      // 1. invest 1000
      // 2. epoch++
      // 3. shares increase 50%
      // 4. initiate withdraw for 500
      // 5. epoch++
      // 6. complete withdraw and get 750 in the vault
      // 7. initiate withdraw for 500
      // 8. invest 1000
      // 9. epoch++
      // 10. invest 1000
      // end result ~750 USDC in the vault & ~2750 USDC invested assets

      const amount = parseUSDC('1000');
      await ForkHelpers.mintToken(usdc, strategy.address, amount);
      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      // generate ~50% yield
      const poolBalance = await usdc.balanceOf(ryskLiquidityPool.address);
      await ForkHelpers.mintToken(
        usdc,
        ryskLiquidityPool.address,
        poolBalance.div(2),
      );

      await strategy.connect(admin).withdrawToVault(parseUSDC('500'));

      await executeEpochCalculation();

      await strategy.connect(admin).completeWithdrawal();

      await strategy.connect(admin).withdrawToVault('500');

      await ForkHelpers.mintToken(usdc, strategy.address, amount);
      await strategy.connect(admin).invest();

      await executeEpochCalculation();

      await ForkHelpers.mintToken(usdc, strategy.address, amount);
      await strategy.connect(admin).invest();

      expect(await usdc.balanceOf(vault.address)).to.gte('732572000');
      expect(await strategy.investedAssets()).to.gte('2732572000');
    });
  });

  describe('bug: stuck after initiating a withdrawal with shares amount less than 1e12', async () => {
    it('should not be stuck', async () => {
      const amount = parseUSDC('1000');
      await ForkHelpers.mintToken(usdc, admin.address, amount);

      console.log('deposit...');
      await usdc.connect(admin).approve(ryskLiquidityPool.address, amount);
      await ryskLiquidityPool
        .connect(admin)
        .deposit(amount, { gasLimit: 1000000 });
      console.log('deposit done');

      await executeEpochCalculation();

      const shareFraction = '99999999999'; // 1e12 - 1
      console.log('initiateWithdraw, shares:', shareFraction);
      await ryskLiquidityPool
        .connect(admin)
        .initiateWithdraw(shareFraction, { gasLimit: 1000000 });
      console.log('initiateWithdraw done');

      await executeEpochCalculation();
      console.log('new epoch started');

      // this should not fail but it does
      console.log('completeWithdraw...');
      await expect(ryskLiquidityPool.connect(admin).completeWithdraw()).to.be
        .reverted;
      console.log('completeWithdraw failed');

      // this is expected to fail because of incomplete withdrawal started in previous epoch
      const sharesInRegularRange = parseUnits('10');
      console.log('second initiateWithdraw, shares:');
      await expect(
        ryskLiquidityPool.connect(admin).initiateWithdraw(sharesInRegularRange),
      ).to.be.reverted;
      console.log('second initiateWithdraw failed');

      console.log("aaaand we're stuck");
      // effectivly at this point we are stuck, we can only deposit but not withdraw
      // this comes because failing 'amountForShares' function at line 293 Accounting.sol returns 0 and completeWIthdraw at line 218 Accounting.sol reverts
      // it fails for values of shares less than 1e12 because of the rounding error when converting shares (18 decimals) to USDC amount (6 decimals)
      // if 1 USDC = 1 share, converting 1e12-1 shares to USDC is rounded to 0
      // as a workaround to withdraw the rest of funds (unstuck), we can transfer shares to another account and then withdraw from there
      const withdrawalEpoch = await ryskLiquidityPool.withdrawalEpoch();
      const pricePerShare =
        await ryskLiquidityPool.withdrawalEpochPricePerShare(
          withdrawalEpoch.sub(1),
        );
      accounting = Accounting__factory.connect(ACCOUNTING, admin);
      const amountForShares = await accounting.amountForShares(
        shareFraction,
        pricePerShare,
      );
      expect(amountForShares).to.eq('0');
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
