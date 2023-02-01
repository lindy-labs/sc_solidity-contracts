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
  const WETH_oSQTH_UNISWAP_POOL = '0x82c427AdFDf2d245Ec51D8046b41c4ee87F0d29C';
  const USDC_WETH_UNISWAP_POOL = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';
  const UNISWAP_SWAP_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
  const ORACLE = '0x65D66c76447ccB45dAf1e8044e918fA786A483A1';

  const FORK_BLOCK_1 = 16094470; // collateralization ratio 200.76%
  const FORK_BLOCK_2 = 16147760; // collateralization ratio 194.56%

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK_1); //  16147760

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

    // uniPool = IUniswapV3Pool__factory.connect(WETH_oSQTH_UNISWAP_POOL, admin);
    // expect(await uniPool.token0()).to.eq(WETH);
    // expect(await uniPool.token1()).to.eq(oSQTH);

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

    // 787029136771394475
    strategy = await OpynCrabStrategyFactory.deploy(
      vault.address,
      admin.address,
      admin.address,
      usdc.address,
      weth.address,
      osqth.address,
      CRAB_STRATEGY_V2,
      CRAB_HELPER,
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
    xit('deposits', async () => {
      await ForkHelpers.mintToken(usdc, strategy.address, parseUSDC('15000'));

      // await strategy.invest();
      console.log('*** USDC_WETH ***');
      console.log('token0', wethUsdcUniV3Pool.token0.name);
      console.log('uniPool.token0Price', await wethUsdcUniV3Pool.token0Price);
      console.log('uniPool.token1Price', await wethUsdcUniV3Pool.token1Price);

      const token0 = new Token(
        1,
        usdc.address,
        await usdc.decimals(),
        await usdc.symbol(),
        await usdc.name(),
      );
      const token1 = new Token(
        1,
        weth.address,
        await weth.decimals(),
        await weth.symbol(),
        await weth.name(),
      );

      //

      console.log(
        `1 WETH = ${wethUsdcUniV3Pool.token0Price.quote(
          CurrencyAmount.fromRawAmount(token0, parseUnits('1').toString()),
        )} USDC`,
      );
      console.log(
        wethUsdcUniV3Pool.token1Price
          .quote(CurrencyAmount.fromRawAmount(token0, '1'))
          .toFixed(6),
      );
    });

    it.only('#invest -> #investedAssets -> #withdrawToVault', async () => {
      const depositAmount = parseUSDC('10000');
      const minEthAmount = '7852544515515418078';
      const ethToBorrow = '7726903803267171388';
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
      await ForkHelpers.mintToken(usdc, strategy.address, depositAmount);

      await strategy.invest();

      await strategy.withdrawToVault(depositAmount.div(2));

      expect(await usdc.balanceOf(strategy.address)).to.gt(
        parseUSDC('4980'), // fees & slippage included
      );
    });
  });
});
