import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';

import {
  ForkHelpers,
  generateNewAddress,
  moveForwardTwoWeeks,
} from '../../shared';

import {
  Vault,
  ERC20,
  ERC20__factory,
  IStabilityPool,
  IStabilityPool__factory,
  LiquityStrategy,
} from '../../../typechain';

const { parseUnits } = ethers.utils;

describe('Liquity Strategy (mainnet fork tests)', () => {
  let admin: SignerWithAddress;

  let vault: Vault;
  let lqtyStabilityPool: IStabilityPool;
  let lusd: ERC20;
  let lqty: ERC20;
  let strategy: LiquityStrategy;

  const TWO_WEEKS = time.duration.days(14).toNumber();
  const INVEST_PCT = 10000; // set 100% for test
  const INVESTMENT_FEE_PCT = 0; // set 0% for test
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  const STABILITY_POOL = '0x66017d22b0f8556afdd19fc67041899eb65a21bb';
  const LUSD = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
  const LQTY = '0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D';

  const FORK_BLOCK = 15269696;
  const EXPECTED_LQTY_REWARD = '39553740600841980000';
  const EXPECTED_ETH_REWARD = '1183860347390000';
  // address of the '0x' contract performing the token swap
  const SWAP_TARGET = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';
  // cached response data for swapping LQTY->LUSD from `https://api.0x.org/swap/v1/quote?buyToken=${LUSD}&sellToken=${lqty.address}&sellAmount=${39553740600841980000}` at FORK_BLOCK
  const SWAP_LQTY_DATA =
    '0xd9627aa4000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000224eb1d830321c860000000000000000000000000000000000000000000000001d9fa402217f685ac000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000006dea81c8171d0ba574754ef6f8b412f2ed88c54d000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000005f98805a4e8be255a32880fdec7f6728c6568ba0869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000a644841b4262ea7823';
  // cached response data for swapping ETH->LUSD from `https://api.0x.org/swap/v1/quote?buyToken=${LUSD}&sellToken=ETH&sellAmount=${1183860347390000}' at FORK_BLOCK
  const SWAP_ETH_DATA =
    '0xd9627aa40000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000434b6f77848300000000000000000000000000000000000000000000000001a2e21b388f4588200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000005f98805a4e8be255a32880fdec7f6728c6568ba0869584cd000000000000000000000000100000000000000000000000000000000000001100000000000000000000000000000000000000000000006155a7e2b862ea7824';

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);

    [admin] = await ethers.getSigners();

    lqtyStabilityPool = IStabilityPool__factory.connect(STABILITY_POOL, admin);

    lusd = ERC20__factory.connect(LUSD, admin);
    lqty = ERC20__factory.connect(LQTY, admin);

    const VaultFactory = await ethers.getContractFactory('Vault');

    vault = await VaultFactory.deploy(
      lusd.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      admin.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
    );

    const LiquityStrategyFactory = await ethers.getContractFactory(
      'LiquityStrategy',
    );

    strategy = await LiquityStrategyFactory.deploy(
      vault.address,
      admin.address,
      lqtyStabilityPool.address,
      lqty.address,
      lusd.address,
    );

    await vault.setStrategy(strategy.address);
    await strategy.connect(admin).grantRole(MANAGER_ROLE, admin.address);

    lusd.connect(admin).approve(vault.address, ethers.constants.MaxUint256);
  });

  it('deposits underlying from strategy to the stability pool on #invest', async () => {
    const amountInvested = parseUnits('1000');
    await ForkHelpers.mintToken(lusd, strategy.address, amountInvested);

    const stabilityPoolInitialBalance = await lusd.balanceOf(
      lqtyStabilityPool.address,
    );

    await strategy.invest();

    expect(await lusd.balanceOf(strategy.address)).to.eq('0');
    expect(await strategy.investedAssets()).to.eq(amountInvested);
    expect(await lusd.balanceOf(lqtyStabilityPool.address)).to.eq(
      stabilityPoolInitialBalance.add(amountInvested),
    );
  });

  it('claims rewards from the stability pool and reinvests all on #harvest', async () => {
    const troveManagerAddress = await lqtyStabilityPool.troveManager();
    await ForkHelpers.impersonate([troveManagerAddress]);
    const troveManager = await ethers.getSigner(troveManagerAddress);

    const initialInvestment = parseUnits('10000');
    await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
    await strategy.invest();

    // LQTY issuance (rewards) is time dependent, so we need to advance time here
    await moveForwardTwoWeeks();

    // call offset to generate yield in the stability pool
    const lusdDebtToOffset = parseUnits('10000');
    const ethCollateralToAdd = parseUnits('10');
    await ForkHelpers.setBalance(troveManager.address, ethCollateralToAdd);

    // calling offset will rebalance the stability pool by removing LUSD and adding ETH,
    // while also generating LQTY tokens as rewards for the liquidity providers
    await lqtyStabilityPool
      .connect(troveManager)
      .offset(lusdDebtToOffset, ethCollateralToAdd);

    expect(
      await lqtyStabilityPool.getDepositorLQTYGain(strategy.address),
    ).to.eq(EXPECTED_LQTY_REWARD);
    expect(await lqtyStabilityPool.getDepositorETHGain(strategy.address)).to.eq(
      EXPECTED_ETH_REWARD,
    );

    // assert initial balances for the strategy
    expect(await lusd.balanceOf(strategy.address)).to.eq('0');
    expect(await lqty.balanceOf(strategy.address)).to.eq('0');
    expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');

    // withdraw gains from stability pool and reinvests
    await strategy.harvest(SWAP_TARGET, SWAP_LQTY_DATA, SWAP_ETH_DATA);

    // assert no funds are held by the strategy after harvest is executed
    expect(await lusd.balanceOf(strategy.address)).to.eq('0');
    expect(await lqty.balanceOf(strategy.address)).to.eq('0');
    expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');

    // assert rewards collected are being reinvested
    expect(await strategy.investedAssets()).to.gt(initialInvestment);
  });

  it('swaps LUSD and ETH already held by the strategy on #harvest', async () => {
    const initialInvestment = parseUnits('10000');
    await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
    await strategy.invest();

    await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);
    await ForkHelpers.setBalance(
      strategy.address,
      BigNumber.from(EXPECTED_ETH_REWARD),
    );

    // withdraw gains from stability pool and reinvests
    await strategy.harvest(SWAP_TARGET, SWAP_LQTY_DATA, SWAP_ETH_DATA);

    // assert no funds remain held by the strategy
    expect(await lusd.balanceOf(strategy.address)).to.eq('0');
    expect(await lqty.balanceOf(strategy.address)).to.eq('0');
    expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');

    expect(await strategy.investedAssets()).to.gt(initialInvestment);
  });

  it('claims rewards and withdraws assets from the stability pool on #withdrawToVault', async () => {
    const troveManagerAddress = await lqtyStabilityPool.troveManager();
    await ForkHelpers.impersonate([troveManagerAddress]);
    const troveManager = await ethers.getSigner(troveManagerAddress);

    await ForkHelpers.mintToken(lusd, strategy.address, parseUnits('10000'));
    await strategy.invest();

    // LQTY issuance (rewards) is time dependent, so we need to advance time here
    await moveForwardTwoWeeks();

    // call offset to generate rewards for liquidity providers
    const lusdDebtToOffset = parseUnits('10000');
    const ethCollateralToAdd = parseUnits('10');
    await ForkHelpers.setBalance(troveManager.address, ethCollateralToAdd);

    await lqtyStabilityPool
      .connect(troveManager)
      .offset(lusdDebtToOffset, ethCollateralToAdd);

    expect(
      await lqtyStabilityPool.getDepositorLQTYGain(strategy.address),
    ).to.eq(EXPECTED_LQTY_REWARD);
    expect(await lqtyStabilityPool.getDepositorETHGain(strategy.address)).to.eq(
      EXPECTED_ETH_REWARD,
    );

    expect(await lusd.balanceOf(strategy.address)).to.eq('0');
    expect(await lqty.balanceOf(strategy.address)).to.eq('0');
    expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');

    // this will also claim the rewards from the stability pool
    const amountToWithdraw = parseUnits('5000');
    await strategy.connect(admin).withdrawToVault(amountToWithdraw);

    expect(await lusd.balanceOf(strategy.address)).to.eq('0');
    expect(await lqty.balanceOf(strategy.address)).to.eq(EXPECTED_LQTY_REWARD);
    expect(await ethers.provider.getBalance(strategy.address)).to.eq(
      EXPECTED_ETH_REWARD,
    );

    expect(await strategy.investedAssets()).to.eq('4998816139652613137823');
    expect(await lusd.balanceOf(vault.address)).to.eq(amountToWithdraw);
  });
});
