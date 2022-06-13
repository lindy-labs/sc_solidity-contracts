import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { Contract, utils, BigNumber, constants, Signer } from 'ethers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';

import {
  Vault,
  MockUST__factory,
  MockUST,
  MockSyncStrategy,
  Vault__factory,
} from '../typechain';

import { depositParams, claimParams } from './shared/factories';

import {
  getLastBlockTimestamp,
  moveForwardTwoWeeks,
  SHARES_MULTIPLIER,
  generateNewAddress,
  getRoleErrorMsg,
  arrayFromTo,
} from './shared';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('Vault in sync mode', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let newAccount: SignerWithAddress;

  let underlying: MockUST;
  let vault: Vault;
  let strategy: MockSyncStrategy;

  const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());
  const MAX_DEPOSIT_LOCK_DURATION = BigNumber.from(
    time.duration.weeks(24).toNumber(),
  );
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('200');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');
  const INVEST_PCT = BigNumber.from('9000');
  const DENOMINATOR = BigNumber.from('10000');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const INVESTOR_ROLE = utils.keccak256(utils.toUtf8Bytes('INVESTOR_ROLE'));
  const SETTINGS_ROLE = utils.keccak256(utils.toUtf8Bytes('SETTINGS_ROLE'));
  const SPONSOR_ROLE = utils.keccak256(utils.toUtf8Bytes('SPONSOR_ROLE'));

  const fixtures = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture(['vaults']);

    [owner, alice, bob, carol] = await ethers.getSigners();

    const ustDeployment = await deployments.get('UST');
    const ustVaultDeployment = await deployments.get('Vault_UST');

    underlying = MockUST__factory.connect(ustDeployment.address, owner);
    vault = Vault__factory.connect(ustVaultDeployment.address, owner);

    await addUnderlyingBalance(alice, '1000');
    await addUnderlyingBalance(bob, '1000');
    await addUnderlyingBalance(carol, '1000');
  });

  beforeEach(() => fixtures());

  beforeEach(async () => {
    [owner, alice, bob, carol, newAccount] = await ethers.getSigners();

    let Vault = await ethers.getContractFactory('Vault');
    let MockStrategy = await ethers.getContractFactory('MockSyncStrategy');

    vault = await Vault.deploy(
      underlying.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      owner.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    underlying.connect(owner).approve(vault.address, MaxUint256);
    underlying.connect(alice).approve(vault.address, MaxUint256);
    underlying.connect(bob).approve(vault.address, MaxUint256);
    underlying.connect(carol).approve(vault.address, MaxUint256);

    strategy = await MockStrategy.deploy(vault.address, underlying.address);

    await vault.connect(owner).setStrategy(strategy.address);
  });

  describe('#claimYield when there are not enough funds in the vault', () => {
    it('claims the total yield from the strategy', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('949'),
      );
    });

    it('claims partial yield from the strategy', async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault('40');
      await vault.connect(owner).updateInvested();
      await addYieldToVault('10');

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits('949'),
      );
    });

    it("rebalances the Vault's reserves", async () => {
      const params = depositParams.build({
        amount: parseUnits('100'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault('50');
      await vault.connect(owner).updateInvested();

      await vault.connect(alice).claimYield(alice.address);

      expect(await underlying.balanceOf(vault.address)).to.eq(
        '10100000000000000000',
      );
    });
  });

  async function addYieldToVault(amount: string) {
    await underlying.mint(vault.address, parseUnits(amount));
    return parseUnits(amount);
  }

  async function addUnderlyingBalance(
    account: SignerWithAddress,
    amount: string,
  ) {
    await underlying.mint(account.address, parseUnits(amount));
    return underlying
      .connect(account)
      .approve(vault.address, parseUnits(amount));
  }

  function removeUnderlyingFromVault(amount: string) {
    return underlying.burn(vault.address, parseUnits(amount));
  }
});
