import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { utils, BigNumber, constants } from 'ethers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';

import {
  Vault,
  MockStrategyDirect,
  Vault__factory,
  MockLUSD__factory,
  MockLUSD,
  MockERC20,
} from '../typechain';

import createVaultHelpers from './shared/vault';
import { depositParams, claimParams } from './shared/factories';
import {
  getLastBlockTimestamp,
  moveForwardTwoWeeks,
  SHARES_MULTIPLIER,
  generateNewAddress,
  getRoleErrorMsg,
  arrayFromTo,
  CURVE_SLIPPAGE,
} from './shared';

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
  ) => Promise<BigNumber>;
  let addYieldToVault: (amount: string) => Promise<BigNumber>;
  let removeUnderlyingFromVault: (amount: string) => Promise<BigNumber>;

  const MOCK_STRATEGY = 'MockStrategyDirect';
  const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());
  const MAX_DEPOSIT_LOCK_DURATION = BigNumber.from(
    time.duration.weeks(24).toNumber(),
  );
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');
  const INVEST_PCT = BigNumber.from('10000');
  const DENOMINATOR = BigNumber.from('10000');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const KEEPER_ROLE = utils.keccak256(utils.toUtf8Bytes('KEEPER_ROLE'));
  const SETTINGS_ROLE = utils.keccak256(utils.toUtf8Bytes('SETTINGS_ROLE'));
  const SPONSOR_ROLE = utils.keccak256(utils.toUtf8Bytes('SPONSOR_ROLE'));

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
      10000,
    );

    await vault.setStrategy(strategy.address);

    ({ addUnderlyingBalance, addYieldToVault, removeUnderlyingFromVault } =
      createVaultHelpers({
        vault,
        underlying,
      }));
  });

  it('supports direct transfers from the strategy to the user', async () => {
    await addUnderlyingBalance(alice, '100');

    const params = depositParams.build({
      amount: parseUnits('100'),
      inputToken: underlying.address,
      claims: [claimParams.percent(100).to(alice.address).build()],
    });

    await vault.connect(alice).deposit(params);

    await addYieldToVault('100');

    await vault.updateInvested();

    await vault.connect(alice).claimYield(alice.address);

    expect(await underlying.balanceOf(alice.address)).to.eq(parseUnits('0'));

    expect(await yieldUnderlying.balanceOf(alice.address)).to.eq(
      parseUnits('100'),
    );
  });

  it('throws an error if funds are not available', async () => {
    await addUnderlyingBalance(alice, '100');

    await strategy.setPrincipalPct(11000);

    const params = depositParams.build({
      amount: parseUnits('100'),
      inputToken: underlying.address,
      claims: [claimParams.percent(100).to(alice.address).build()],
    });

    await vault.connect(alice).deposit(params);

    await addYieldToVault('100');

    await vault.updateInvested();

    await expect(
      vault.connect(alice).claimYield(alice.address),
    ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
  });

  it('throws an error if funds are not available - 2', async () => {
    await addUnderlyingBalance(alice, '100');

    await vault.setInvestPct(5000);

    await strategy.setPrincipalPct(11000);

    const params = depositParams.build({
      amount: parseUnits('100'),
      inputToken: underlying.address,
      claims: [
        claimParams.percent(50).to(alice.address).build(),
        claimParams.percent(50).to(bob.address).build(),
      ],
    });

    await vault.connect(alice).deposit(params);

    await addYieldToVault('200');

    await vault.updateInvested();

    await expect(
      vault.connect(alice).claimYield(alice.address),
    ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
  });
});
