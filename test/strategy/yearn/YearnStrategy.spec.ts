import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { time } from '@openzeppelin/test-helpers';
import { expect } from 'chai';
import { BigNumber, utils, constants } from 'ethers';
import {
  Vault,
  MockYearnVault,
  YearnStrategy,
  MockERC20,
} from '../../../typechain';
import { generateNewAddress } from '../../shared/';

describe('YearnStrategy', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let yVault: MockYearnVault;
  let strategy: YearnStrategy;
  let lusd: MockERC20;
  let underlying: MockERC20;
  const TREASURY = generateNewAddress();
  const MIN_LOCK_PERIOD = 1;
  const TWO_WEEKS = time.duration.days(14).toNumber();
  const PERFORMANCE_FEE_PCT = BigNumber.from('200');
  const INVEST_PCT = BigNumber.from('9000');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');
  const DENOMINATOR = BigNumber.from('10000');

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  beforeEach(async () => {
    [owner, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    lusd = await MockERC20.deploy(
      'LUSD',
      'LUSD',
      18,
      utils.parseEther('1000000000'),
    );

    underlying = lusd;

    // deploy yearn lusd vault
    const yVaultFactory = await ethers.getContractFactory('MockYearnVault');

    // deploy sandclock vault
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

    const YearnStrategyFactory = await ethers.getContractFactory(
      'YearnStrategy',
    );

    strategy = await YearnStrategyFactory.deploy(
      vault.address,
      owner.address,
      yVault.address,
      underlying.address,
    );
  });
});
