import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';

import {
  ForkHelpers,
  generateNewAddress,
  moveForwardTwoWeeks,
} from '../shared';

import {
  Vault,
  ERC20,
  ERC20__factory,
  IYearnVault,
  IYearnVault__factory,
  YearnStrategy,
} from '../../typechain';

import { depositParams, claimParams } from '../shared/factories';

const { formatUnits, parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

const FORK_BLOCK = 14988444;
const YEARN_VAULT = '0x378cb52b00F9D0921cb46dFc099CFf73b42419dC';
const LUSD = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
const W_LUSD = '0x378cb52b00f9d0921cb46dfc099cff73b42419dc';

describe('Yearn Strategy (mainnet fork tests)', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let vault: Vault;
  let yearnVault: IYearnVault;
  let lusd: ERC20;
  let wLusd: ERC20;
  let strategy: YearnStrategy;

  const TWO_WEEKS = time.duration.days(14).toNumber();
  const INVEST_PCT = 9000; // set 100% for test
  const INVESTMENT_FEE_PCT = 1000; // set 100% for test
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('200');

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);

    [owner, alice, bob] = await ethers.getSigners();

    yearnVault = IYearnVault__factory.connect(YEARN_VAULT, owner);

    lusd = ERC20__factory.connect(LUSD, owner);
    wLusd = ERC20__factory.connect(W_LUSD, owner);

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      lusd.address,
      TWO_WEEKS,
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
      yearnVault.address,
      lusd.address,
    );

    await vault.setStrategy(strategy.address);

    await ForkHelpers.mintToken(
      lusd,
      alice,
      parseUnits('1000', await lusd.decimals()),
    );

    lusd.connect(owner).approve(vault.address, MaxUint256);
    lusd.connect(alice).approve(vault.address, MaxUint256);
  });

  it('deposits underlying from our Vault to the YearnVault', async () => {
    await ForkHelpers.mintToken(
      lusd,
      vault.address,
      parseUnits('1000', await lusd.decimals()),
    );

    const yearnVaultBalance = await lusd.balanceOf(yearnVault.address);

    await vault.updateInvested();

    expect(await lusd.balanceOf(vault.address)).to.eq(parseUnits('100'));
    expect(await lusd.balanceOf(strategy.address)).to.eq(parseUnits('0'));
    expect(await lusd.balanceOf(yearnVault.address)).to.eq(
      yearnVaultBalance.add(parseUnits('900')),
    );
  });

  it('receives wrapped LUSD for the deposit to Yearn', async () => {
    await ForkHelpers.mintToken(
      lusd,
      vault.address,
      parseUnits('1000', await lusd.decimals()),
    );

    expect(await wLusd.balanceOf(strategy.address)).to.eq(parseUnits('0'));

    await vault.updateInvested();

    expect(await wLusd.balanceOf(strategy.address)).not.to.eq(parseUnits('0'));
  });

  it('withdraws underlying from Yearn', async () => {
    await ForkHelpers.mintToken(
      lusd,
      alice.address,
      parseUnits('1000', await lusd.decimals()),
    );

    await vault.connect(alice).deposit(
      depositParams.build({
        amount: parseUnits('1000'),
        inputToken: lusd.address,
        claims: [claimParams.percent(100).to(alice.address).build()],
      }),
    );

    await vault.updateInvested();

    expect(await wLusd.balanceOf(strategy.address)).not.to.eq(parseUnits('0'));

    await moveForwardTwoWeeks();

    // TODO FIX
    await ForkHelpers.mintToken(
      lusd,
      strategy.address,
      parseUnits('1', await lusd.decimals()),
    );

    await vault.connect(alice).withdraw(alice.address, [1]);
  });
});
