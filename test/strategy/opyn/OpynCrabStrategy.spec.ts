import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { ethers, upgrades } from 'hardhat';
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
  MockSwapRouter,
  MockOracle,
} from '../../../typechain';

import { generateNewAddress, getETHBalance, parseUSDC } from '../../shared/';
import { depositParams, claimParams } from '../../shared/factories';
import { setBalance } from '../../shared/forkHelpers';
import createVaultHelpers from '../../shared/vault';

const { parseUnits } = ethers.utils;

describe('OpynCrabStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let manager: SignerWithAddress;
  let keeper: SignerWithAddress;
  let vault: Vault;
  let strategy: OpynCrabStrategy;
  let underlying: MockUSDC;
  let weth: MockWETH;
  let oSqth: MockOSQTH;
  let crabStrategyV2: MockCrabStrategyV2;
  let swapRouter: MockSwapRouter;
  let oracle: MockOracle;

  let CrabStrategyFactory: OpynCrabStrategy__factory;

  let addUnderlyingBalance: (
    account: SignerWithAddress,
    amount: string,
  ) => Promise<void>;

  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = BigNumber.from(time.duration.weeks(2).toNumber());
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));
  const KEEPER_ROLE = utils.keccak256(utils.toUtf8Bytes('KEEPER_ROLE'));
  const SETTINGS_ROLE = utils.keccak256(utils.toUtf8Bytes('SETTINGS_ROLE'));

  beforeEach(async () => {
    [admin, alice, bob, manager, keeper] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    underlying = await MockUSDC.deploy(parseUSDC('1000000000'));

    const MockWETH = await ethers.getContractFactory('MockWETH');
    weth = await MockWETH.deploy(parseUnits('1000000000'));

    const MockOSQTH = await ethers.getContractFactory('MockOSQTH');
    oSqth = await MockOSQTH.deploy(parseUnits('1000000000'));

    const MockCrabStrategyV2 = await ethers.getContractFactory(
      'MockCrabStrategyV2',
    );
    crabStrategyV2 = await MockCrabStrategyV2.deploy();

    const MockV3Pool = await ethers.getContractFactory('MockV3Pool');
    const wethOsqthPool = await MockV3Pool.deploy();
    const usdcWethPool = await MockV3Pool.deploy();

    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    swapRouter = await MockSwapRouter.deploy();

    const MockOracle = await ethers.getContractFactory('MockOracle');
    oracle = await MockOracle.deploy();

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
      constants.AddressZero,
      wethOsqthPool.address,
      usdcWethPool.address,
      swapRouter.address,
      oracle.address,
    );

    await vault.setStrategy(strategy.address);

    await underlying
      .connect(admin)
      .approve(vault.address, constants.MaxUint256);

    ({ addUnderlyingBalance } = createVaultHelpers({
      vault,
      underlying,
    }));
  });

  describe('#constructor', () => {
    it('checks initial values', async () => {
      console.log('strategy.address', strategy.address);
    });
  });
});
