import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers, upgrades } from 'hardhat';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockStabilityPool,
  MockERC20,
  LiquityStrategy,
  LiquityStrategy__factory,
} from '../typechain';

import { generateNewAddress } from './shared/';

const { parseUnits } = ethers.utils;

describe('LiquityStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let keeper: SignerWithAddress;
  let vault: Vault;
  let stabilityPool: MockStabilityPool;
  let strategy: LiquityStrategy;
  let underlying: MockERC20;
  let lqty: MockERC20;

  let LiquityStrategyFactory: LiquityStrategy__factory;

  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = 1;
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');
  const INVESTMENT_FEE_PCT = BigNumber.from('0');

  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  it('Deployments', async () => {
    [admin, alice, manager, keeper] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');

    underlying = await MockERC20.deploy(
      'LUSD',
      'LUSD',
      18,
      parseUnits('1000000000'),
    );

    lqty = await MockERC20.deploy('LQTY', 'LQTY', 18, parseUnits('1000000000'));

    const StabilityPoolFactory = await ethers.getContractFactory(
      'MockStabilityPool',
    );

    stabilityPool = await StabilityPoolFactory.deploy(
      underlying.address,
      '0x0000000000000000000000000000000000000000',
    );

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
    );

    LiquityStrategyFactory = await ethers.getContractFactory('LiquityStrategy');

    const strategyProxy = await upgrades.deployProxy(
      LiquityStrategyFactory,
      [
        vault.address,
        admin.address,
        stabilityPool.address,
        lqty.address,
        underlying.address,
        keeper.address,
      ],
      {
        kind: 'uups',
      },
    );

    // await strategyProxy.deployed();

    // strategy = LiquityStrategyFactory.attach(strategyProxy.address);

    // await strategy.connect(admin).grantRole(MANAGER_ROLE, manager.address);

    await underlying
      .connect(admin)
      .approve(vault.address, constants.MaxUint256);

    await vault.setStrategy(strategyProxy.address);

    console.log('Strategy deployed at', strategyProxy.address);
    console.log('Vault deployed at', vault.address);
    console.log('Underlying deployed at', underlying.address);
    console.log('LQTY deployed at', lqty.address);
  });
});
