import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';

import {
  Vault,
  MockERC20,
  MockBaseStrategy,
  MockBaseStrategy__factory,
} from '../../typechain';

import { generateNewAddress } from '../shared/';

describe('BaseStrategy', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let strategy: MockBaseStrategy;
  let underlying: MockERC20;

  let BaseStrategyFactory: MockBaseStrategy__factory;

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    [admin, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    underlying = await MockERC20.deploy(
      'ERC20',
      'ERC20',
      18,
      ethers.utils.parseUnits('1000000000'),
    );

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      underlying.address,
      1, // MIN_LOCK_PERIOD,
      BigNumber.from('0'), // INVEST_PCT,
      generateNewAddress(), // TREASURY
      admin.address,
      BigNumber.from('0'), // PERFORMANCE_FEE_PCT,
      BigNumber.from('0'), // INVESTMENT_FEE_PCT,
      [],
    );

    BaseStrategyFactory = await ethers.getContractFactory('MockBaseStrategy');

    strategy = await BaseStrategyFactory.deploy(
      vault.address,
      underlying.address,
      admin.address,
    );

    await vault.setStrategy(strategy.address);
  });

  describe('#constructor', () => {
    it('reverts if admin is address(0)', async () => {
      await expect(
        BaseStrategyFactory.deploy(
          vault.address,
          underlying.address,
          constants.AddressZero,
        ),
      ).to.be.revertedWith('StrategyAdminCannotBe0Address');
    });

    it('reverts if underlying is address(0)', async () => {
      await expect(
        BaseStrategyFactory.deploy(
          vault.address,
          constants.AddressZero,
          admin.address,
        ),
      ).to.be.revertedWith('StrategyUnderlyingCannotBe0Address');
    });

    it('reverts if vault does not have IVault interface', async () => {
      await expect(
        BaseStrategyFactory.deploy(
          manager.address,
          underlying.address,
          admin.address,
        ),
      ).to.be.revertedWith('StrategyNotIVault');
    });

    it('asserts initial values are as expected', async () => {
      expect(await strategy.vault()).to.eq(vault.address);
      expect(await strategy.underlying()).to.eq(underlying.address);

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.true;
    });
  });

  describe('#transferAdminRights', () => {
    it('reverts if caller is not admin', async () => {
      await expect(
        strategy.connect(alice).transferAdminRights(alice.address),
      ).to.be.revertedWith('StrategyCallerNotAdmin');
    });

    it('reverts if new admin is address(0)', async () => {
      await expect(
        strategy.connect(admin).transferAdminRights(constants.AddressZero),
      ).to.be.revertedWith('StrategyAdminCannotBe0Address');
    });

    it('reverts if the new admin is the same as the current one', async () => {
      await expect(
        strategy.connect(admin).transferAdminRights(admin.address),
      ).to.be.revertedWith('StrategyCannotTransferAdminRightsToSelf');
    });

    it('revokes ADMIN role for the previous admin account and sets the ADMIN role for the new admin account', async () => {
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .false;

      await strategy.connect(admin).transferAdminRights(alice.address);

      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .false;
      expect(await strategy.hasRole(DEFAULT_ADMIN_ROLE, alice.address)).to.be
        .true;
    });
  });
});
