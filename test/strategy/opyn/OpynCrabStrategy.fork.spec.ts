import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';
import { Pool } from '@uniswap/v3-sdk';
import { Token, CurrencyAmount } from '@uniswap/sdk-core';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';

import {
  ForkHelpers,
  generateNewAddress,
  depositParams,
  parseUSDC,
  claimParams,
  getUniswapV3Pool,
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
  let wethUsdcUniV3Pool: Pool;
  let wethOsqthUniV3Pool: Pool;
  let crabStrategyV2: ICrabStrategyV2;
  let crabNetting: ICrabNetting;

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
  const CRAB_HELPER = '0x2F55e27E669F070dEf7B5771dB72f6B31A6d4df8'; // Opyn CrabHelper
  const CRAB_NETTING = '0x6E536adDB53d1b47d357cdca83BCF460194A395F';
  const OWNER_CRAB_NETTING = '0xAfE66363c27EedB597a140c28B70b32F113fd5a8';
  const WETH_oSQTH_UNISWAP_POOL = '0x82c427AdFDf2d245Ec51D8046b41c4ee87F0d29C';
  const USDC_WETH_UNISWAP_POOL = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';
  const UNISWAP_SWAP_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
  const ORACLE = '0x65D66c76447ccB45dAf1e8044e918fA786A483A1';

  beforeEach(async () => {
    // await ForkHelpers.forkToMainnet(16094470);
    await ForkHelpers.forkToMainnet(16539370);

    [admin, alice] = await ethers.getSigners();

    usdc = ERC20__factory.connect(USDC, admin);
    weth = ERC20__factory.connect(WETH, admin);
    osqth = ERC20__factory.connect(oSQTH, admin);

    wethUsdcUniV3Pool = await getUniswapV3Pool(
      USDC_WETH_UNISWAP_POOL,
      usdc,
      weth,
    );
    wethOsqthUniV3Pool = await getUniswapV3Pool(
      WETH_oSQTH_UNISWAP_POOL,
      weth,
      osqth,
    );

    crabStrategyV2 = ICrabStrategyV2__factory.connect(CRAB_STRATEGY_V2, admin);
    crabNetting = ICrabNetting__factory.connect(CRAB_NETTING, admin);

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
      WETH_oSQTH_UNISWAP_POOL,
      USDC_WETH_UNISWAP_POOL,
      UNISWAP_SWAP_ROUTER,
      ORACLE,
    );

    await vault.setStrategy(strategy.address);

    await usdc.connect(admin).approve(vault.address, MaxUint256);
    await usdc.connect(alice).approve(vault.address, MaxUint256);
    await strategy.connect(admin).grantRole(MANAGER_ROLE, admin.address);
  });

  describe('#invest', () => {
    it.only('#invest -> #investedAssets -> #withdrawToVault', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6560000000000000000';
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);

      await strategy.invest();
      await strategy.flashDepositToCrabStrategy(
        depositAmount,
        minEthAmount,
        ethToBorrow,
      );

      const invested = await strategy.investedAssets();
      expect(invested).to.gt(parseUSDC('9600')); // with fees & slippage taken from 10000

      await strategy.withdrawToVault(depositAmount);

      expect(await usdc.balanceOf(strategy.address)).to.gt(parseUSDC('9300')); // fees & slippage included
    });

    it.only('#invest -> #withdrawToVault for half amount deposited', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6568960000000000000'; // f(collateralization ratio); atm collateralization ratio 190.44%
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);

      await strategy.invest();

      await strategy.flashDepositToCrabStrategy(
        depositAmount,
        minEthAmount,
        ethToBorrow,
      );

      const x = await crabStrategyV2.getVaultDetails();
      console.log('x', x);

      await strategy.withdrawToVault(depositAmount.div(2));

      expect(await usdc.balanceOf(strategy.address)).to.gt(
        parseUSDC('4980'), // fees & slippage included
      );
    });

    it.only('#invest thru netting contract', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '5999366505836873648';
      const ethToBorrow = '6568960000000000000'; // f(collateralization ratio); atm collateralization ratio 190.44%
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);

      await strategy.depositToCrabNetting(depositAmount);

      const deposited = await crabNetting.usdBalance(strategy.address);

      console.log('deposited\t', deposited.toString());

      const depositsQueued = await crabNetting.depositsQueued();
      const withdrawsQueued = await crabNetting.withdrawsQueued();

      await ForkHelpers.impersonate([OWNER_CRAB_NETTING]);
      const crabNettingOwner = await ethers.getSigner(OWNER_CRAB_NETTING);
      await ForkHelpers.setBalance(OWNER_CRAB_NETTING, parseUnits('1'));

      const crabPriceInWeth = await strategy.getOraclePrice(
        WETH_oSQTH_UNISWAP_POOL,
        oSQTH,
        WETH,
      );
      const wethPriceInUsdc = await strategy.getOraclePrice(
        USDC_WETH_UNISWAP_POOL,
        WETH,
        USDC,
      );

      console.log('depositsQueued\t', depositsQueued.toString());
      console.log('withdrawsQueued\t', withdrawsQueued.toString());

      console.log('crabPriceInWeth\t', crabPriceInWeth.toString());
      console.log('wethPriceInUsdc\t', wethPriceInUsdc.toString());

      const crabPriceInUsdc = crabPriceInWeth
        .div(1e9)
        .mul(wethPriceInUsdc)
        .div(1e9);

      console.log('crabPriceInUsdc\t', crabPriceInUsdc.toString());

      const fairPrice = await strategy.getCrabFairPrice();

      await crabNetting
        .connect(crabNettingOwner)
        .netAtPrice(fairPrice, depositsQueued);

      const crabBalance = await crabStrategyV2.balanceOf(strategy.address);

      console.log('crabBalance\t', crabBalance.toString());

      await strategy.investedAssets();

      // crabPriceInWeth  0.61966525918995800
      // wethPriceInUsdc  1665.751660000000000000
      // crabPriceInUsdc  103. 220841883181500000
    });
  });
});
