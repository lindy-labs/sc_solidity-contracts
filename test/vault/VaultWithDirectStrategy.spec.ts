import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { BigNumber } from 'ethers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';

import {
  Vault,
  MockStrategyDirect,
  Vault__factory,
  MockLUSD__factory,
  MockLUSD,
  MockERC20,
} from '../../typechain';

import createVaultHelpers from '../shared/vault';
import { depositParams, claimParams } from '../shared/factories';
import { generateNewAddress } from '../shared';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('VaultWithDirectStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let underlying: MockLUSD;
  let yieldUnderlying: MockERC20;
  let vault: Vault;

  let strategy: MockStrategyDirect;

  let addUnderlyingBalance: (
    account: SignerWithAddress,
    amount: string,
  ) => Promise<void>;
  let addYieldToVault: (amount: string) => Promise<BigNumber>;
  let underlyingBalanceOf: (
    account: SignerWithAddress | Vault,
  ) => Promise<BigNumber>;

  const MOCK_STRATEGY = 'MockStrategyDirect';
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
    [admin, alice, bob, carol] = await ethers.getSigners();

    let Vault = await ethers.getContractFactory('Vault');

    let MockStrategy = await ethers.getContractFactory(MOCK_STRATEGY);

    vault = await Vault.deploy(
      underlying.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      admin.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
      0,
    );

    let MockERC20 = await ethers.getContractFactory('MockERC20');

    yieldUnderlying = await MockERC20.deploy(
      'YieldUnderlying',
      'YU',
      18,
      parseUnits('1000000000'),
    );

    underlying.connect(admin).approve(vault.address, MaxUint256);
    underlying.connect(alice).approve(vault.address, MaxUint256);
    underlying.connect(bob).approve(vault.address, MaxUint256);
    underlying.connect(carol).approve(vault.address, MaxUint256);

    strategy = await MockStrategy.deploy(
      vault.address,
      underlying.address,
      admin.address,
      yieldUnderlying.address,
    );

    await vault.setStrategy(strategy.address);

    ({ addUnderlyingBalance, addYieldToVault, underlyingBalanceOf } =
      createVaultHelpers({
        vault,
        underlying,
      }));
  });

  describe('#claimYield', () => {
    it('transfers yield in the yield underlying from the strategy to the user', async () => {
      await addUnderlyingBalance(alice, '100');

      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await yieldUnderlying.mint(strategy.address, parseUnits('100'));

      await vault.updateInvested();

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlyingBalanceOf(alice)).to.eq(parseUnits('0'));
      expect(await yieldBalanceOf(alice)).to.eq(parseUnits('100'));
    });

    it("transfers yield in both assets when the strategy yield underlying balance doesn't cover the whole yield", async () => {
      await addUnderlyingBalance(alice, '100');

      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await addYieldToVault('10');
      await yieldUnderlying.mint(strategy.address, parseUnits('90'));

      await vault.updateInvested();

      expect(await underlyingBalanceOf(vault)).to.eq(parseUnits('0'));
      expect(await yieldBalanceOf(strategy)).to.eq(parseUnits('90'));

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlyingBalanceOf(alice)).to.eq(parseUnits('10'));
      expect(await yieldBalanceOf(alice)).to.eq(parseUnits('90'));
      expect(await underlyingBalanceOf(vault)).to.eq(parseUnits('0'));
    });

    it('transfers yield in underlying only if the strategy yield underlying balance is 0', async () => {
      await addUnderlyingBalance(alice, '100');

      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await addYieldToVault('100');

      await vault.updateInvested();

      expect(await underlyingBalanceOf(vault)).to.eq(parseUnits('0'));
      expect(await yieldBalanceOf(strategy)).to.eq(parseUnits('0'));

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlyingBalanceOf(alice)).to.eq(parseUnits('100'));
      expect(await yieldBalanceOf(alice)).to.eq(parseUnits('0'));
      expect(await underlyingBalanceOf(vault)).to.eq(parseUnits('0'));
    });
  });

  async function yieldBalanceOf(
    account: SignerWithAddress | MockStrategyDirect,
  ) {
    return yieldUnderlying.balanceOf(account.address);
  }
});
