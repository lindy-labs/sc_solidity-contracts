import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';

import { ForkHelpers, generateNewAddress } from './shared';

import {
  Vault,
  ERC20,
  ERC20__factory,
  IYearnVault,
  IYearnVault__factory,
  LusdStrategy,
} from '../typechain';

const { formatUnits, parseUnits } = ethers.utils;

const FORK_BLOCK = 14988444;
const YEARN_VAULT = '0x378cb52b00F9D0921cb46dFc099CFf73b42419dC';
const LUSD = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';

describe('Yearn Strategy (fork tests)', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let vault: Vault;
  let yearnVault: IYearnVault;
  let lusdToken: ERC20;
  let strategy: LusdStrategy;

  const TWO_WEEKS = time.duration.days(14).toNumber();
  const INVEST_PCT = 9000; // set 100% for test
  const INVESTMENT_FEE_PCT = 1000; // set 100% for test
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('200');

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);

    [owner, alice, bob] = await ethers.getSigners();

    yearnVault = IYearnVault__factory.connect(YEARN_VAULT, owner);

    lusdToken = ERC20__factory.connect(LUSD, owner);

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      lusdToken.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      owner.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    const YearnStrategyFactory = await ethers.getContractFactory(
      'LusdStrategy',
    );

    strategy = await YearnStrategyFactory.deploy(
      vault.address,
      owner.address,
      yearnVault.address,
      lusdToken.address,
    );

    await vault.setStrategy(strategy.address);

    await ForkHelpers.mintToken(
      lusdToken,
      alice,
      parseUnits('1000', await lusdToken.decimals()),
    );
  });

  it('receives ERC20 from yearn', async () => {
    await ForkHelpers.mintToken(
      lusdToken,
      vault.address,
      parseUnits('1000', await lusdToken.decimals()),
    );

    const yearnVaultBalance = await lusdToken.balanceOf(yearnVault.address);

    await vault.updateInvested();

    expect(await lusdToken.balanceOf(vault.address)).to.eq(parseUnits('100'));
    expect(await lusdToken.balanceOf(strategy.address)).to.eq(parseUnits('0'));
    expect(await lusdToken.balanceOf(yearnVault.address)).to.eq(
      yearnVaultBalance.add(parseUnits('900')),
    );
  });
});
