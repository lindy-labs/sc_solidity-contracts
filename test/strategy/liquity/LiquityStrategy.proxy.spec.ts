/**
 * Tests for the proxy functionality of the Liquity Strategy contract
 */

// todo: tests
// switching off old methods
// adding new methods
// upgrading old virtual methods
// checking the old storage storage variables are same as before upgrade
// testing the initialize method is not called again the new upgrade
// testing the new initializeV2 method is being called

import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockStabilityPool,
  LiquityStrategy,
  MockLiquityStrategyV2,
  MockERC20,
  LiquityStrategy__factory,
  MockLiquityStrategyV2__factory,
} from '../../../typechain';

import { generateNewAddress } from '../../shared/';
import { depositParams, claimParams } from '../../shared/factories';

const { parseEther } = utils;

// address of the '0x' contract performing the token swap
const SWAP_TARGET = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';
// cached response data for swapping LQTY->LUSD from `https://api.0x.org/swap/v1/quote?buyToken=${LUSD}&sellToken=${lqty.address}&sellAmount=${39553740600841980000}` at FORK_BLOCK
const SWAP_LQTY_DATA =
  '0xd9627aa4000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000224eb1d830321c860000000000000000000000000000000000000000000000001d9fa402217f685ac000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000006dea81c8171d0ba574754ef6f8b412f2ed88c54d000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000005f98805a4e8be255a32880fdec7f6728c6568ba0869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000a644841b4262ea7823';
// cached response data for swapping ETH->LUSD from `https://api.0x.org/swap/v1/quote?buyToken=${LUSD}&sellToken=ETH&sellAmount=${1183860347390000}' at FORK_BLOCK
const SWAP_ETH_DATA =
  '0xd9627aa40000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000434b6f77848300000000000000000000000000000000000000000000000001a2e21b388f4588200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000005f98805a4e8be255a32880fdec7f6728c6568ba0869584cd000000000000000000000000100000000000000000000000000000000000001100000000000000000000000000000000000000000000006155a7e2b862ea7824';

describe('LiquityStrategy Proxy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let vault: Vault;
  let stabilityPool: MockStabilityPool;
  let strategy: LiquityStrategy;
  let strategyV2: MockLiquityStrategyV2;
  let underlying: MockERC20;
  let lqty: MockERC20;
  let testToken: MockERC20;

  let LiquityStrategyFactory: LiquityStrategy__factory;
  let MockLiquityStrategyV2Factory: MockLiquityStrategyV2__factory;

  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = 1;
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');
  const INVESTMENT_FEE_PCT = BigNumber.from('0');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    [admin, alice] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    underlying = await MockERC20.deploy(
      'LUSD',
      'LUSD',
      18,
      parseEther('1000000000'),
    );

    lqty = await MockERC20.deploy('LQTY', 'LQTY', 18, parseEther('1000000000'));
    testToken = await MockERC20.deploy(
      'TEST',
      'TEST',
      18,
      parseEther('1000000000'),
    );

    const StabilityPoolFactory = await ethers.getContractFactory(
      'MockStabilityPool',
    );

    stabilityPool = await StabilityPoolFactory.deploy(underlying.address);

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
    MockLiquityStrategyV2Factory = await ethers.getContractFactory(
      'MockLiquityStrategyV2',
    );

    const strategy_proxy = await upgrades.deployProxy(
      LiquityStrategyFactory,
      [
        vault.address,
        admin.address,
        stabilityPool.address,
        lqty.address,
        underlying.address,
      ],
      {
        kind: 'uups',
      },
    );

    await strategy_proxy.deployed();

    strategy = LiquityStrategyFactory.attach(strategy_proxy.address);

    await vault.setStrategy(strategy.address);

    await underlying
      .connect(admin)
      .approve(vault.address, constants.MaxUint256);

    const strategyV2_proxy = await upgrades.upgradeProxy(
      strategy.address,
      MockLiquityStrategyV2Factory,
    );

    strategyV2 = MockLiquityStrategyV2Factory.attach(strategyV2_proxy.address);
  });

  describe('proxy', () => {
    it('strategy address is same after upgrade', async () => {
      expect(strategy.address).to.equal(strategyV2.address);
    });

    it('old storage parameters & values are unchanged after the upgrade', async () => {
      expect(await strategyV2.vault()).to.equal(vault.address);
      expect(await strategyV2.stabilityPool()).to.equal(stabilityPool.address);
      expect(await strategyV2.lqty()).to.equal(lqty.address);
      expect(await strategyV2.underlying()).to.equal(underlying.address);
    });

    it('old methods are unchanged', async () => {
      expect(await strategyV2.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await strategyV2.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .false;

      await strategyV2.connect(admin).transferAdminRights(alice.address);

      expect(await strategyV2.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .false;
      expect(await strategyV2.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .true;
    });

    it('new storage parameters & methods added work', async () => {
      expect(await strategyV2.getVersion()).to.equal(2);

      expect(await strategyV2.newToken()).to.equal(constants.AddressZero);
      await strategyV2.connect(admin).updateNewToken(testToken.address);
      expect(await strategyV2.newToken()).to.equal(testToken.address);
    });

    it('closing an old method workds', async () => {
      await expect(
        strategyV2.harvest(SWAP_TARGET, SWAP_LQTY_DATA, SWAP_ETH_DATA),
      ).to.be.revertedWith('HarvestError');
    });
  });
});
