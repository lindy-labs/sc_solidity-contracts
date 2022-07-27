import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, constants, utils } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';

import {
  ForkHelpers,
  generateNewAddress,
  moveForwardTwoWeeks,
} from '../shared';

import {
  Vault,
  ERC20,
  ERC20__factory,
  IStabilityPool,
  IStabilityPool__factory,
  LiquityStrategy,
} from '../../typechain';

import { depositParams, claimParams } from '../shared/factories';

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
  let lqtyToken: ERC20;
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
    lqtyToken = ERC20__factory.connect(LQTY, owner);

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
      lqtyToken.address,
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

  it('WIP', async () => {
    await ForkHelpers.mintToken(lusd, strategy.address, parseUnits('1000'));

    await strategy.invest();

    const activePoolAddress = await lqtyStabilityPool.activePool();
    await ForkHelpers.impersonate([activePoolAddress]);
    const activePool = await ethers.getSigner(activePoolAddress);

    // let gainedEth = await lqtyStabilityPool.getDepositorETHGain(
    //   strategy.address,
    // );
    // console.log('gained ETH', gainedEth);

    const tx = await activePool.sendTransaction({
      to: lqtyStabilityPool.address,
      value: parseUnits('1'),
    });

    expect(tx).to.emit(lqtyStabilityPool, 'StabilityPoolETHBalanceUpdated');

    // TODO: find a way to generate yield in the stability pool

    // gainedEth = await lqtyStabilityPool.getDepositorETHGain(strategy.address);
    // console.log('gained ETH', gainedEth);
  });
});
