import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { BigNumber, constants } from 'ethers';
import { ethers, deployments, upgrades } from 'hardhat';
import { expect } from 'chai';

import {
  Vault,
  Vault__factory,
  MockLUSD__factory,
  MockLUSD,
  MockERC20,
  Mock0x,
  LiquityStrategy,
  MockStabilityPool,
  MockLQTY,
} from '../typechain';

import { setBalance } from '../test/shared/forkHelpers';
import createVaultHelpers from './shared/vault';
import { depositParams, claimParams } from './shared/factories';
import { generateNewAddress } from './shared';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('VaultWithLiquity', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let keeper: SignerWithAddress;

  let underlying: MockLUSD;
  let yieldUnderlying: MockERC20;
  let vault: Vault;

  let lqty: MockERC20;
  let stabilityPool: MockStabilityPool;
  let strategy: LiquityStrategy;

  let mock0x: Mock0x;

  let addUnderlyingBalance: (
    account: SignerWithAddress,
    amount: string,
  ) => Promise<void>;
  let addYieldToVault: (amount: string) => Promise<BigNumber>;
  let underlyingBalanceOf: (
    account: SignerWithAddress | Vault,
  ) => Promise<BigNumber>;

  const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVESTMENT_FEE_PCT = BigNumber.from('0');
  const INVEST_PCT = BigNumber.from('10000');

  const fixtures = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture(['vault']);

    [admin] = await ethers.getSigners();

    const lusdDeployment = await deployments.get('LUSD');
    const lusdVaultDeployment = await deployments.get('Vault_LUSD');

    underlying = MockLUSD__factory.connect(lusdDeployment.address, admin);
    vault = Vault__factory.connect(lusdVaultDeployment.address, admin);
  });

  beforeEach(() => fixtures());

  beforeEach(async () => {
    [admin, alice, bob, keeper] = await ethers.getSigners();

    const StabilityPoolFactory = await ethers.getContractFactory(
      'MockStabilityPool',
    );

    stabilityPool = await StabilityPoolFactory.deploy(
      underlying.address,
      constants.AddressZero,
    );

    let Vault = await ethers.getContractFactory('Vault');

    vault = await Vault.deploy(
      underlying.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      admin.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    let MockERC20 = await ethers.getContractFactory('MockERC20');

    lqty = await MockERC20.deploy('LQTY', 'LQTY', 18, parseUnits('1000000000'));

    yieldUnderlying = await MockERC20.deploy(
      'YieldUnderlying',
      'YU',
      18,
      parseUnits('1000000000'),
    );

    underlying.connect(admin).approve(vault.address, MaxUint256);
    underlying.connect(alice).approve(vault.address, MaxUint256);
    underlying.connect(bob).approve(vault.address, MaxUint256);
    underlying.connect(keeper).approve(vault.address, MaxUint256);

    const CurveEchange = await ethers.getContractFactory('MockCurveExchange');

    const curveEchange = await CurveEchange.deploy([underlying.address]);

    const LiquityStrategyFactory = await ethers.getContractFactory(
      'LiquityStrategy',
    );

    const strategyProxy = await upgrades.deployProxy(
      LiquityStrategyFactory,
      [
        vault.address,
        admin.address,
        stabilityPool.address,
        lqty.address,
        underlying.address,
        keeper.address,
        0,
        curveEchange.address,
      ],
      {
        kind: 'uups',
      },
    );

    await strategyProxy.deployed();

    strategy = LiquityStrategyFactory.attach(strategyProxy.address);

    await vault.setStrategy(strategy.address);

    const Mock0x = await ethers.getContractFactory('Mock0x');

    mock0x = await Mock0x.deploy([lqty.address, underlying.address]);

    await strategy.allowSwapTarget(mock0x.address);

    ({ addUnderlyingBalance, addYieldToVault, underlyingBalanceOf } =
      createVaultHelpers({
        vault,
        underlying,
      }));
  });

  describe('#transferYield', () => {
    it('transfers yield in ETH from the strategy to the user', async () => {
      await addUnderlyingBalance(alice, '100');
      const alicesInitialEthBalace = await getETHBalance(alice.address);

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
      const swapData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [
          constants.AddressZero, // from
          underlying.address, // to
          parseUnits('10'),
        ],
      );

      await strategy.reinvest(
        mock0x.address,
        0,
        [],
        parseUnits('10'),
        swapData,
        parseUnits('10'),
      );

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlyingBalanceOf(alice)).to.eq(parseUnits('0'));
      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('40'));
      // we have to ignore the gas cost for alice here
      expect(
        (await getETHBalance(alice.address)).sub(alicesInitialEthBalace),
      ).to.gte(parseUnits('4999', 16));
      expect(await strategy.investedAssets()).to.eq(parseUnits('150'));
    });

    it('transfers yield in LUSD from the strategy to the user when ETH balance < yield amount', async () => {
      await addUnderlyingBalance(alice, '100');
      const alicesInitialEthBalace = await getETHBalance(alice.address);

      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await vault.updateInvested();

      // add 100 ETH to the strategy
      setBalance(strategy.address, parseUnits('100'));

      // swap 10 ETH for LUSD and reinvest
      const swapData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256'],
        [
          constants.AddressZero, // from
          underlying.address, // to
          parseUnits('10'),
        ],
      );

      await strategy.reinvest(
        mock0x.address,
        0,
        [],
        parseUnits('10'),
        swapData,
        parseUnits('10'),
      );

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlyingBalanceOf(alice)).to.eq(parseUnits('100'));
      expect(await getETHBalance(strategy.address)).to.eq(parseUnits('90'));
      expect(await strategy.investedAssets()).to.eq(parseUnits('100'));
    });
  });

  async function yieldBalanceOf(account: SignerWithAddress | LiquityStrategy) {
    return yieldUnderlying.balanceOf(account.address);
  }

  function getETHBalance(account: string) {
    return ethers.provider.getBalance(account);
  }
});
