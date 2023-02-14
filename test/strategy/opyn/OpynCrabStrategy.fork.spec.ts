import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';

import {
  ForkHelpers,
  generateNewAddress,
  parseUSDC,
  getETHBalance,
} from '../../shared';

import {
  Vault,
  ERC20,
  ERC20__factory,
  OpynCrabStrategy,
  ICrabStrategyV2,
  ICrabStrategyV2__factory,
  ICrabNetting,
  ICrabNetting__factory,
  IOracle,
  IOracle__factory,
  IUniswapV3Pool,
  IUniswapV3Pool__factory,
} from '../../../typechain';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('Opyn Crab Strategy (mainnet fork tests)', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;

  let vault: Vault;
  let usdc: ERC20;
  let weth: ERC20;
  let osqth: ERC20;
  let strategy: OpynCrabStrategy;
  let usdcWethPool: IUniswapV3Pool;
  let wethOsqthPool: IUniswapV3Pool;
  let crabStrategyV2: ICrabStrategyV2;
  let crabNetting: ICrabNetting;
  let oracle: IOracle;

  const TWO_WEEKS = time.duration.days(14).toNumber();
  const INVEST_PCT = 10000; // set 100% for test
  const INVESTMENT_FEE_PCT = 0; // set 0% for test
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  // mainnet addresses
  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const oSQTH = '0xf1B99e3E573A1a9C5E6B2Ce818b617F0E664E86B'; // squeeth
  const CRAB_STRATEGY_V2 = '0x3B960E47784150F5a63777201ee2B15253D713e8'; // Opyn CrabStrategyV2
  const CRAB_NETTING = '0x6E536adDB53d1b47d357cdca83BCF460194A395F';
  const CRAB_NETTING_OWNER = '0xAfE66363c27EedB597a140c28B70b32F113fd5a8';
  const WETH_oSQTH_UNISWAP_POOL = '0x82c427AdFDf2d245Ec51D8046b41c4ee87F0d29C';
  const USDC_WETH_UNISWAP_POOL = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';
  const UNISWAP_SWAP_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
  const ORACLE = '0x65D66c76447ccB45dAf1e8044e918fA786A483A1'; // implemented by Opyn

  beforeEach(async () => {
    // await ForkHelpers.forkToMainnet(16094470);
    await ForkHelpers.forkToMainnet(16539370);

    [admin, alice] = await ethers.getSigners();

    usdc = ERC20__factory.connect(USDC, admin);
    weth = ERC20__factory.connect(WETH, admin);
    osqth = ERC20__factory.connect(oSQTH, admin);

    crabStrategyV2 = ICrabStrategyV2__factory.connect(CRAB_STRATEGY_V2, admin);
    crabNetting = ICrabNetting__factory.connect(CRAB_NETTING, admin);
    oracle = IOracle__factory.connect(ORACLE, admin);
    usdcWethPool = IUniswapV3Pool__factory.connect(
      USDC_WETH_UNISWAP_POOL,
      admin,
    );
    wethOsqthPool = IUniswapV3Pool__factory.connect(
      WETH_oSQTH_UNISWAP_POOL,
      admin,
    );

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
      10000,
    );

    const OpynCrabStrategyFactory = await ethers.getContractFactory(
      'OpynCrabStrategy',
    );

    strategy = await OpynCrabStrategyFactory.deploy(
      vault.address,
      admin.address,
      admin.address,
      usdc.address,
      weth.address,
      osqth.address,
      CRAB_STRATEGY_V2,
      CRAB_NETTING,
      UNISWAP_SWAP_ROUTER,
      ORACLE,
      USDC_WETH_UNISWAP_POOL,
      WETH_oSQTH_UNISWAP_POOL,
    );

    await vault.setStrategy(strategy.address);

    await usdc.connect(admin).approve(vault.address, MaxUint256);
    await usdc.connect(alice).approve(vault.address, MaxUint256);
    await strategy.connect(admin).grantRole(MANAGER_ROLE, admin.address);
  });

  describe('#flashDeposit', () => {
    it('deposits to crab', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6568963540410773159'; // determined with error 1e12 // 68132737275
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);

      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        '7652474754549369768',
      );
    });

    it('swaps any eth leftovers after depositing to usdc', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = parseUnits('5');
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);

      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        '6697180468067257165',
      );
      expect(await usdc.balanceOf(strategy.address)).to.eq('1249013409'); // ~1249 usdc
      expect(await getETHBalance(strategy.address)).to.eq('0'); // strategy shold not hold any eth
    });

    it('reverts when eth min amount out is greater than eth received from usdc->eth swap', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = parseUnits('6');
      const ethToBorrow = '6568960000000000000';
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);

      await expect(
        strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow),
      ).to.be.revertedWith('Too little received'); // too little eth received from usdc->eth swap
    });

    it('reverts when eth borrowed in flash swap cannot be payed off with minted squeeth', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = parseUnits('7');
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);

      await expect(
        strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow),
      ).to.be.reverted;
    });
  });

  describe('#queueUSDC', () => {
    it('queues usdc on crab netting contract', async () => {
      const depositAmount = parseUSDC('10000');
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);

      await strategy.queueUSDC(depositAmount);

      expect(await usdc.balanceOf(strategy.address)).to.eq('0');
      expect(await crabNetting.usdBalance(strategy.address)).to.eq(
        depositAmount,
      );
    });

    it('receives crab for queued usdc after netting out is done', async () => {
      const depositAmount = parseUSDC('10000');
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);

      await strategy.queueUSDC(depositAmount);

      await ForkHelpers.impersonate([CRAB_NETTING_OWNER]);
      const crabNettingOwner = await ethers.getSigner(CRAB_NETTING_OWNER);
      await ForkHelpers.setBalance(CRAB_NETTING_OWNER, parseUnits('1'));

      const crabFairPriceInUsdc = (await strategy.getCrabFairPrice()).div(1e12);
      const depositsQueued = await crabNetting.depositsQueued();

      await crabNetting
        .connect(crabNettingOwner)
        .netAtPrice(crabFairPriceInUsdc, depositsQueued);

      expect(await crabNetting.usdBalance(strategy.address)).to.eq('0');
      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        '7696450146749831202',
      );
      expect(await strategy.investedAssets()).to.eq('10000000006');
    });
  });

  describe('#queueCrab', () => {
    it('queues crab on crab netting contract', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6568960000000000000';
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);
      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      const crabBalance = await crabStrategyV2.balanceOf(strategy.address);
      await strategy.queueCrab(crabBalance);

      expect(await crabNetting.crabBalance(strategy.address)).to.eq(
        crabBalance,
      );
      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq('0');
    });
  });

  describe('#flashWithdraw', () => {
    it('withdraws from crab strategy and swaps to usdc', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6568963540410773159'; // determined with error 1e12
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);
      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      const crabBalance = await crabStrategyV2.balanceOf(strategy.address);
      const crabToWithdraw = crabBalance.div(2);

      expect(await strategy.investedAssets()).to.eq('9942862879');

      await strategy.flashWithdraw(crabToWithdraw, parseUnits('7'), '0');

      expect(await crabStrategyV2.balanceOf(strategy.address)).to.eq(
        crabBalance.div(2),
      );
      expect(await usdc.balanceOf(strategy.address)).to.eq('4966332922');
      expect(await strategy.investedAssets()).to.eq('9937764305'); // decreased by ~6 usdc because of fees & slippage
      expect(await getETHBalance(strategy.address)).to.eq('0'); // strategy shold not hold any eth
    });

    it('reverts when max eth to pay debt is too low', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6568963540410773159'; // determined with error 1e12
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);
      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      const crabBalance = await crabStrategyV2.balanceOf(strategy.address);
      const squeethDebt = await crabStrategyV2.getWsqueethFromCrabAmount(
        crabBalance,
      );
      const maxEthToPayDebt = await strategy.calcMaxEthToPaySqueethDebt(
        squeethDebt,
      );
      const insufficentMaxEthToPayDebt = maxEthToPayDebt.sub(parseUnits('1'));

      await expect(
        strategy.flashWithdraw(crabBalance, insufficentMaxEthToPayDebt, '0'),
      ).to.be.revertedWith('amount in greater than max');
    });

    it('reverts when usdc amount out min is too low', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6568963540410773159'; // determined with error 1e12
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);
      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      const crabBalance = await crabStrategyV2.balanceOf(strategy.address);
      const actualUsdcAmountOut = BigNumber.from('9924024435');
      const insufficientUsdcAmountOutMin = actualUsdcAmountOut.sub('1');

      await expect(
        strategy.flashWithdraw(
          crabBalance,
          parseUnits('7'),
          insufficientUsdcAmountOutMin,
        ),
      ).to.be.revertedWith('Too little received');
    });
  });

  describe('#withdrawToVault', () => {
    it('withdraws from crab strategy and, swaps to usdc and transfers to vault', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6568963540410773159'; // determined with error 1e12
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);
      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      const invested = await strategy.investedAssets();

      expect(invested).to.eq('9942862879');

      await strategy.withdrawToVault(invested);

      expect(await strategy.investedAssets()).to.eq('0');
      // the end amount is reduced compared to deposit amount by:
      // 1. 2 x 0.3% fee for using uinswap flash swap on wethOsqth pool (swapping weth <-> osqth)
      // 2. 2 x 0.05% fee for using uinswap flash swap on usdcWeth pool (swapping eth <-> usdc)
      // 3. however much is lost on slippage
      expect(await usdc.balanceOf(vault.address)).to.eq('9924024435');
    });

    it('reverts if eth -> usdc swap suffers slippage higher than max', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6568963540410773159'; // determined with error 1e12
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);
      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      const invested = await strategy.investedAssets();

      await strategy.setEthToUsdcMaxSlippagePct('1'); // 0.01%

      await expect(strategy.withdrawToVault(invested)).to.be.revertedWith(
        'Too little received',
      );
    });

    it('reverts if eth -> oSqth flash swap (exact output) suffers slippage higher than max', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6568963540410773159'; // determined with error 1e12
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);
      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      const invested = await strategy.investedAssets();

      await strategy.setEthToOsqthMaxSlippagePct('1'); // 0.01%

      await expect(strategy.withdrawToVault(invested)).to.be.revertedWith(
        'amount in greater than max',
      );
    });

    it('works for withdraws ~100k usdc', async () => {
      const depositAmount = parseUSDC('100000');
      const minEthAmount = '59988086049148492552';
      const ethToBorrow = '63546412104146705853'; // 747786152720 with 1e13 error
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);
      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      const invested = await strategy.investedAssets();

      expect(invested).to.eq('97728701676');

      await strategy.withdrawToVault(invested);

      expect(await strategy.investedAssets()).to.eq('10803829'); // ~10 usdc
      expect(await usdc.balanceOf(vault.address)).to.eq('99245864341');
    });

    it('works for withdraws ~300k usdc', async () => {
      const depositAmount = parseUSDC('300000');
      const minEthAmount = '179927075895159562759';
      const ethToBorrow = '178336621457426334860'; // determined with 1e13 error
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);
      await strategy.flashDeposit(depositAmount, minEthAmount, ethToBorrow);

      const invested = await strategy.investedAssets();

      expect(invested).to.eq('283424031984'); // this difference is from using twaps

      await strategy.withdrawToVault(invested);

      expect(await strategy.investedAssets()).to.eq('93987497'); // ~93 usdc
      expect(await usdc.balanceOf(vault.address)).to.eq('297770343008');
    });
  });
});
