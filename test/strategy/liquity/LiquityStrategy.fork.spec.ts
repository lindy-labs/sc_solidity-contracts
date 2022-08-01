import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, constants, utils } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';
import axios from 'axios';

import {
  ForkHelpers,
  generateNewAddress,
  moveForwardTwoWeeks,
} from '../../shared';

import {
  Vault,
  ERC20,
  ERC20__factory,
  IStabilityPool,
  IStabilityPool__factory,
  LiquityStrategy,
} from '../../../typechain';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

const STABILITY_POOL = '0x66017d22b0f8556afdd19fc67041899eb65a21bb';
const LUSD = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
const LQTY = '0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const CURVE_ROUTER = '0x81C46fECa27B31F3ADC2b91eE4be9717d1cd3DD7';
const CURVE_LUSD_POOL = '0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA';

describe('Liquity Strategy (mainnet fork tests)', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  let vault: Vault;
  let lqtyStabilityPool: IStabilityPool;
  let lusd: ERC20;
  let lqty: ERC20;
  let usdc: ERC20;
  let strategy: LiquityStrategy;

  const TWO_WEEKS = time.duration.days(14).toNumber();
  const INVEST_PCT = 10000; // set 100% for test
  const INVESTMENT_FEE_PCT = 0; // set 0% for test
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet();

    [owner, alice] = await ethers.getSigners();

    lqtyStabilityPool = IStabilityPool__factory.connect(STABILITY_POOL, owner);

    lusd = ERC20__factory.connect(LUSD, owner);
    usdc = ERC20__factory.connect(USDC, owner);
    lqty = ERC20__factory.connect(LQTY, owner);

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      lusd.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      owner.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    const LiquityStrategyFactory = await ethers.getContractFactory(
      'LiquityStrategy',
    );

    strategy = await LiquityStrategyFactory.deploy(
      vault.address,
      owner.address,
      lqtyStabilityPool.address,
      lqty.address,
      usdc.address,
      lusd.address,
      CURVE_ROUTER,
      CURVE_LUSD_POOL,
    );

    await vault.setStrategy(strategy.address);
    await strategy.connect(owner).grantRole(MANAGER_ROLE, owner.address);

    lusd.connect(owner).approve(vault.address, MaxUint256);
    lusd.connect(alice).approve(vault.address, MaxUint256);
  });

  it('deposits underlying from strategy to the Liquity Stability Pool', async () => {
    await ForkHelpers.mintToken(lusd, strategy.address, parseUnits('1000'));

    const stabilityPoolLusdBalance = await lusd.balanceOf(
      lqtyStabilityPool.address,
    );

    await strategy.invest();

    expect(await lusd.balanceOf(strategy.address)).to.eq('0');
    expect(await lusd.balanceOf(lqtyStabilityPool.address)).to.eq(
      stabilityPoolLusdBalance.add(parseUnits('1000')),
    );
  });

  it('swaps LQTY for USDC', async () => {
    const swapAmount = parseUnits('1', await lqty.decimals());

    await ForkHelpers.mintToken(lqty, strategy.address, swapAmount);

    let url = `https://api.0x.org/swap/v1/quote?buyToken=${USDC}&sellToken=${lqty.address}&sellAmount=${swapAmount}`;
    const { data } = await axios.get(url);

    expect(await usdc.balanceOf(strategy.address)).to.eq('0');

    await strategy
      .connect(owner)
      .swap(data.sellTokenAddress, data.sellAmount, data.to, data.data);

    expect(await usdc.balanceOf(strategy.address)).to.gt('0');
  });

  it('swaps ETH for USDC', async () => {
    const swapAmount = parseUnits('1');

    let url = `https://api.0x.org/swap/v1/quote?buyToken=${USDC}&sellToken=ETH&sellAmount=${swapAmount}`;
    const { data } = await axios.get(url);

    expect(await usdc.balanceOf(strategy.address)).to.eq('0');

    await strategy
      .connect(owner)
      .swap(constants.AddressZero, data.sellAmount, data.to, data.data, {
        value: swapAmount,
      });

    expect(await usdc.balanceOf(strategy.address)).to.gt('0');
  });

  it('harvests gains from stability pool and converts them to USDC', async () => {
    const troveManagerAddress = await lqtyStabilityPool.troveManager();
    await ForkHelpers.impersonate([troveManagerAddress]);
    const troveManager = await ethers.getSigner(troveManagerAddress);

    await ForkHelpers.mintToken(lusd, strategy.address, parseUnits('10000'));
    await strategy.invest();

    // to generate LQTY rewards we also need to advance time
    await moveForwardTwoWeeks();

    // generate yield
    const debtToOffsetLusd = parseUnits('10000');
    const collateralToAddETH = parseUnits('10');
    await ForkHelpers.mintToken(lqty, troveManager, debtToOffsetLusd);
    await ForkHelpers.setBalance(troveManager.address, collateralToAddETH);

    await lqtyStabilityPool
      .connect(troveManager)
      .offset(debtToOffsetLusd, collateralToAddETH);

    // get quota and data for selling LQTY rewards
    const lqtyGains = await lqtyStabilityPool.getDepositorLQTYGain(
      strategy.address,
    );
    const sellLqtyResponse = await axios.get(
      `https://api.0x.org/swap/v1/quote?buyToken=${USDC}&sellToken=${lqty.address}&sellAmount=${lqtyGains}`,
    );

    // get quota and data for selling ETH rewards
    const ethGains = await lqtyStabilityPool.getDepositorETHGain(
      strategy.address,
    );
    const sellEthResponse = await axios.get(
      `https://api.0x.org/swap/v1/quote?buyToken=${USDC}&sellToken=ETH&sellAmount=${ethGains}`,
    );

    expect(await lusd.balanceOf(strategy.address)).to.eq('0');
    expect(await lqty.balanceOf(strategy.address)).to.eq('0');
    expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');

    expect(await usdc.balanceOf(strategy.address)).to.eq('0');

    // withdraw gains from stability pool and convert to USDC
    await strategy.harvest(
      sellLqtyResponse.data.to,
      sellLqtyResponse.data.data,
      sellEthResponse.data.data,
    );

    expect(await lusd.balanceOf(strategy.address)).to.eq('0');
    expect(await lqty.balanceOf(strategy.address)).to.eq('0');
    expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');

    expect(await usdc.balanceOf(strategy.address)).to.gt('0');
  });
});
