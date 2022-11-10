import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockStabilityPool,
  LiquityDCAStrategy,
  MockERC20,
  LiquityDCAStrategy__factory,
  MockCurveExchange,
  Mock0x,
  ERC20,
} from '../../../typechain';

import { generateNewAddress, getTransactionGasCost } from '../../shared/';
import { depositParams, claimParams } from '../../shared/factories';
import { setBalance } from '../../shared/forkHelpers';
import createVaultHelpers from '../../shared/vault';

const { parseUnits } = ethers.utils;

describe('LiquityDCAStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let manager: SignerWithAddress;
  let keeper: SignerWithAddress;
  let vault: Vault;
  let stabilityPool: MockStabilityPool;
  let strategy: LiquityDCAStrategy;
  let curveExchange: MockCurveExchange;
  let mock0x: Mock0x;
  let underlying: MockERC20;
  let lqty: MockERC20;

  let LiquityDCAStrategyFactory: LiquityDCAStrategy__factory;

  let addUnderlyingBalance: (
    account: SignerWithAddress,
    amount: string,
  ) => Promise<void>;

  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = BigNumber.from(time.duration.weeks(2).toNumber());
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');
  const INVESTMENT_FEE_PCT = BigNumber.from('0');

  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    [admin, alice, bob, manager, keeper] = await ethers.getSigners();

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

    const CurveExchange = await ethers.getContractFactory('MockCurveExchange');

    curveExchange = await CurveExchange.deploy();

    LiquityDCAStrategyFactory = await ethers.getContractFactory(
      'LiquityDCAStrategy',
    );

    const strategyProxy = await upgrades.deployProxy(
      LiquityDCAStrategyFactory,
      [
        vault.address,
        admin.address,
        stabilityPool.address,
        lqty.address,
        underlying.address,
        keeper.address,
        0,
        curveExchange.address,
      ],
      {
        kind: 'uups',
      },
    );

    await strategyProxy.deployed();

    strategy = LiquityDCAStrategyFactory.attach(strategyProxy.address);

    await strategy.connect(admin).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);

    const Mock0x = await ethers.getContractFactory('Mock0x');
    mock0x = await Mock0x.deploy();

    await strategy.allowSwapTarget(mock0x.address);

    await underlying
      .connect(admin)
      .approve(vault.address, constants.MaxUint256);

    ({ addUnderlyingBalance } = createVaultHelpers({
      vault,
      underlying,
    }));
  });

  describe('#transferYield', () => {
    it('fails if caller is not manager', async () => {
      setBalance(strategy.address, parseUnits('100'));

      await expect(
        strategy.transferYield(admin.address, parseUnits('100')),
      ).to.be.revertedWith('StrategyCallerNotManager');
    });

    it('works when ETH balance is 0', async () => {
      expect(await getETHBalance(strategy.address)).to.eq('0');

      await expect(
        strategy
          .connect(manager)
          .transferYield(admin.address, parseUnits('100')),
      ).not.to.be.reverted;
    });

    it('transfers yield in ETH from the strategy to the user', async () => {
      // add 100 ETH to the strategy
      setBalance(strategy.address, parseUnits('100'));

      const alicesInitialEthBalace = await getETHBalance(alice.address);
      // transfer 100 ETH to alice (1 eth = 1 underlying)
      await strategy
        .connect(manager)
        .transferYield(alice.address, parseUnits('100'));

      expect(await underlying.balanceOf(alice.address)).to.eq(parseUnits('0'));
      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('0'));
      expect(
        (await getETHBalance(alice.address)).sub(alicesInitialEthBalace),
      ).to.eq(parseUnits('100'));
    });

    it('transfers all available ETH to the user when ETH balance < yield amount', async () => {
      // add 90 ETH to the strategy
      setBalance(strategy.address, parseUnits('90'));

      const alicesInitialEthBalace = await getETHBalance(alice.address);
      // try to transfer 100 ETH to alice (1 eth = 1 underlying)
      await strategy
        .connect(manager)
        .transferYield(alice.address, parseUnits('100'));

      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('0'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('0'));
      expect(
        (await getETHBalance(alice.address)).sub(alicesInitialEthBalace),
      ).to.eq(parseUnits('90'));
    });

    it('uses curve exchange LUSD -> USDT && USDT -> WETH to obtain ETH price', async () => {
      // add 1 ETH to the strategy
      setBalance(strategy.address, parseUnits('1'));

      const weth = await strategy.WETH();
      const usdt = await strategy.USDT();
      await curveExchange.setExchageRate(
        underlying.address,
        usdt,
        parseUnits('0.8'), // 1 LUSD = 1.25 USDT
      );
      await curveExchange.setExchageRate(usdt, weth, parseUnits('0.0005')); // 1 WETH = 2000 USDT

      const alicesInitialEthBalace = await getETHBalance(alice.address);
      const amountInUnderlying = parseUnits('2500');
      await strategy
        .connect(manager)
        .transferYield(alice.address, amountInUnderlying);

      expect(await underlying.balanceOf(alice.address)).to.eq(parseUnits('0'));
      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('0'));
      expect(
        (await getETHBalance(alice.address)).sub(alicesInitialEthBalace),
      ).to.eq(parseUnits('1'));
    });

    it('emits StrategyYieldTransferred event with transferred amount in underlying', async () => {
      setBalance(strategy.address, parseUnits('1'));

      const weth = await strategy.WETH();
      const usdt = await strategy.USDT();
      await curveExchange.setExchageRate(
        underlying.address,
        usdt,
        parseUnits('0.8'), // 1 LUSD = 1.25 USDT
      );
      await curveExchange.setExchageRate(usdt, weth, parseUnits('0.0005')); // 1 WETH = 2000 USDT

      const amountInUnderlying = parseUnits('2000');
      const tx = await strategy
        .connect(manager)
        .transferYield(alice.address, amountInUnderlying);

      await expect(tx)
        .to.emit(strategy, 'StrategyYieldTransferred')
        .withArgs(alice.address, amountInUnderlying);
    });

    it('fails if the claimer cannot receive ETH', async () => {
      setBalance(strategy.address, parseUnits('100'));

      await expect(
        strategy
          .connect(manager)
          .transferYield(vault.address, parseUnits('100')),
      ).to.be.revertedWith(`StrategyETHTransferFailed`);
    });

    it('works with pricipal protection set', async () => {
      await addUnderlyingBalance(alice, '100');
      await strategy.setMinPrincipalProtectionPct('11000');

      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [
          claimParams.percent(50).to(alice.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);

      await vault.updateInvested();

      // add 100 ETH to the strategy
      setBalance(strategy.address, parseUnits('100'));

      // swap 10 ETH for LUSD and reinvest
      const ethToReinvest = parseUnits('10');
      const swapData = getSwapData(
        constants.AddressZero,
        underlying,
        ethToReinvest,
      );

      await strategy.reinvest(
        mock0x.address,
        0,
        [],
        ethToReinvest,
        swapData,
        ethToReinvest,
      );

      const alicesInitialEthBalace = await getETHBalance(alice.address);

      let tx = await vault.connect(alice).claimYield(alice.address);

      expect(await underlying.balanceOf(alice.address)).to.eq(parseUnits('0'));
      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('40'));
      expect(
        (await getETHBalance(alice.address))
          .sub(alicesInitialEthBalace)
          .add(await getTransactionGasCost(tx)), // ignore the gas cost
      ).to.eq(parseUnits('50'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('150'));

      const bobsInitialEthBalace = await getETHBalance(bob.address);

      // bob receives 10 in underlying and 40 in ETH
      tx = await vault.connect(bob).claimYield(bob.address);

      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits('10'));
      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('0'));
      expect(
        (await getETHBalance(bob.address))
          .sub(bobsInitialEthBalace)
          .add(await getTransactionGasCost(tx)), // ignore the gas cost
      ).to.eq(parseUnits('40'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('100'));
    });
  });

  function getETHBalance(account: string) {
    return ethers.provider.getBalance(account);
  }

  function getSwapData(
    from: ERC20 | string,
    to: ERC20 | string,
    amount: BigNumber | string,
  ) {
    const fromAddress = typeof from === 'string' ? from : from.address;
    const toAddress = typeof to === 'string' ? to : to.address;

    return ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint256'],
      [fromAddress, toAddress, amount],
    );
  }
});