import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockStabilityPool,
  LiquityStrategy,
  OptimalSwapper,
  MockERC20,
  LiquityStrategy__factory,
} from '../../../typechain';

import { generateNewAddress } from '../../shared/';
import { depositParams, claimParams } from '../../shared/factories';

const { parseEther } = utils;

describe('LiquityStrategy', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let stabilityPool: MockStabilityPool;
  let optimalSwapper: OptimalSwapper;
  let strategy: LiquityStrategy;
  let underlying: MockERC20;
  let lqty: MockERC20;
  let usdc: MockERC20;

  let LiquityStrategyFactory: LiquityStrategy__factory;

  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = 1;
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');
  const INVESTMENT_FEE_PCT = BigNumber.from('0');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    [owner, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    underlying = await MockERC20.deploy(
      'LUSD',
      'LUSD',
      18,
      parseEther('1000000000'),
    );

    lqty = await MockERC20.deploy('LQTY', 'LQTY', 18, parseEther('1000000000'));

    usdc = await MockERC20.deploy('USDC', 'USDC', 18, parseEther('1000000000'));

    const StabilityPoolFactory = await ethers.getContractFactory(
      'MockStabilityPool',
    );

    const OptimalSwapper = await ethers.getContractFactory('OptimalSwapper');

    stabilityPool = await StabilityPoolFactory.deploy();
    // optimalSwapper = await OptimalSwapper.deploy();

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

    LiquityStrategyFactory = await ethers.getContractFactory('LiquityStrategy');

    strategy = await LiquityStrategyFactory.deploy(
      vault.address,
      owner.address,
      stabilityPool.address,
      optimalSwapper.address,
      lqty.address,
      usdc.address,
      underlying.address,
    );

    await strategy.connect(owner).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);

    await underlying
      .connect(owner)
      .approve(vault.address, constants.MaxUint256);
  });
});
