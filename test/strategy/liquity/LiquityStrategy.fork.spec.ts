import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, utils } from 'ethers';
import { ethers, upgrades } from 'hardhat';
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

  // mainnet addresses
  const STABILITY_POOL = '0x66017d22b0f8556afdd19fc67041899eb65a21bb';
  const LUSD = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
  const LQTY = '0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D';

  const FORK_BLOCK = 15269696;
  // reward from stability pool received in LQTY tokens
  const EXPECTED_LQTY_REWARD = BigNumber.from('39553740600841980000');
  // reward from stability pool received in ETH
  const EXPECTED_ETH_REWARD = BigNumber.from('1183860347390000');
  // amount of LUSD received for swapping LQTY reward
  const LQTY_REWARD_IN_LUSD = BigNumber.from('35086994728790148965');
  // amount of LUSD received for swapping ETH reward
  const ETH_REWARD_IN_LUSD = BigNumber.from('1905537726156963558');
  // amount of LUSD received after swapping both
  const REWARD_IN_LUSD = LQTY_REWARD_IN_LUSD.add(ETH_REWARD_IN_LUSD);
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

    const strategyProxy = await upgrades.deployProxy(
      LiquityStrategyFactory,
      [
        vault.address,
        admin.address,
        lqtyStabilityPool.address,
        lqty.address,
        lusd.address,
        admin.address, // keeper
      ],
      {
        kind: 'uups',
      },
    );

    await strategyProxy.deployed();

    strategy = LiquityStrategyFactory.attach(strategyProxy.address);

    await vault.setStrategy(strategy.address);
    strategy.grantRole(MANAGER_ROLE, admin.address);

    lusd.connect(admin).approve(vault.address, ethers.constants.MaxUint256);
  });

  describe('#invest', () => {
    it('deposits underlying from strategy to the stability pool', async () => {
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
  });

  describe('#harvest', () => {
    it('claims LQTY and ETH gains from the stability pool', async () => {
      const troveManagerAddress = await lqtyStabilityPool.troveManager();
      await ForkHelpers.impersonate([troveManagerAddress]);
      const troveManager = await ethers.getSigner(troveManagerAddress);
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      // LQTY issuance is time dependent, so we need to advance time here
      await moveForwardTwoWeeks();

      // call offset to generate yield in the stability pool
      const lusdDebtToOffset = parseUnits('10000');
      const ethCollateralToAdd = parseUnits('10');
      ForkHelpers.setBalance(troveManager.address, ethCollateralToAdd);
      // calling offset will rebalance the stability pool by removing LUSD and adding ETH,
      // while also generating LQTY tokens as rewards for the liquidity providers
      await lqtyStabilityPool
        .connect(troveManager)
        .offset(lusdDebtToOffset, ethCollateralToAdd);

      expect(
        await lqtyStabilityPool.getDepositorLQTYGain(strategy.address),
      ).to.eq(EXPECTED_LQTY_REWARD);
      expect(
        await lqtyStabilityPool.getDepositorETHGain(strategy.address),
      ).to.eq(EXPECTED_ETH_REWARD);
      // assert initial balances for the strategy
      expect(await lusd.balanceOf(strategy.address)).to.eq('0');
      expect(await lqty.balanceOf(strategy.address)).to.eq('0');
      expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');

      await strategy.harvest();

      expect(await lusd.balanceOf(strategy.address)).to.eq('0');
      expect(await lqty.balanceOf(strategy.address)).to.eq(
        EXPECTED_LQTY_REWARD,
      );
      expect(await ethers.provider.getBalance(strategy.address)).to.eq(
        EXPECTED_ETH_REWARD,
      );
    });
  });

  describe('#reinvest', () => {
    it('swaps LQTY and ETH already held by the strategy and reinvests all ', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);
      ForkHelpers.setBalance(strategy.address, EXPECTED_ETH_REWARD);

      await strategy.reinvest(
        SWAP_TARGET,
        EXPECTED_LQTY_REWARD,
        SWAP_LQTY_DATA,
        EXPECTED_ETH_REWARD,
        SWAP_ETH_DATA,
        REWARD_IN_LUSD,
      );

      // assert no funds remain held by the strategy
      expect(await lusd.balanceOf(strategy.address)).to.eq('0');
      expect(await lqty.balanceOf(strategy.address)).to.eq('0');
      expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');

      expect(await strategy.investedAssets()).to.eq(
        initialInvestment.add(LQTY_REWARD_IN_LUSD).add(ETH_REWARD_IN_LUSD),
      );
    });

    it("emits 'StrategyReinvested' event", async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);
      ForkHelpers.setBalance(strategy.address, EXPECTED_ETH_REWARD);

      expect(
        await strategy.reinvest(
          SWAP_TARGET,
          EXPECTED_LQTY_REWARD,
          SWAP_LQTY_DATA,
          EXPECTED_ETH_REWARD,
          SWAP_ETH_DATA,
          REWARD_IN_LUSD,
        ),
      )
        .to.emit(strategy, 'Reinvested')
        .withArgs(LQTY_REWARD_IN_LUSD.add(ETH_REWARD_IN_LUSD));
    });

    it('works if swap data is provided only for LQTY tokens', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);
      ForkHelpers.setBalance(strategy.address, EXPECTED_ETH_REWARD);

      await strategy.reinvest(
        SWAP_TARGET,
        EXPECTED_LQTY_REWARD,
        SWAP_LQTY_DATA,
        EXPECTED_ETH_REWARD,
        [],
        LQTY_REWARD_IN_LUSD,
      );

      expect(await lusd.balanceOf(strategy.address)).to.eq('0');
      expect(await lqty.balanceOf(strategy.address)).to.eq('0');
      expect(await ethers.provider.getBalance(strategy.address)).to.eq(
        EXPECTED_ETH_REWARD,
      );

      expect(await strategy.investedAssets()).to.eq(
        initialInvestment.add(LQTY_REWARD_IN_LUSD),
      );
    });

    it('works if swap data is provided only for ETH', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);
      ForkHelpers.setBalance(strategy.address, EXPECTED_ETH_REWARD);

      await strategy.reinvest(
        SWAP_TARGET,
        EXPECTED_LQTY_REWARD,
        [],
        EXPECTED_ETH_REWARD,
        SWAP_ETH_DATA,
        ETH_REWARD_IN_LUSD,
      );

      expect(await lqty.balanceOf(strategy.address)).to.eq(
        EXPECTED_LQTY_REWARD,
      );
      expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');
      expect(await strategy.investedAssets()).to.eq(
        initialInvestment.add(ETH_REWARD_IN_LUSD),
      );
    });

    it('works if ETH amount to swap is less than total ETH amount held by the strategy', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      const totalEthAmount = EXPECTED_ETH_REWARD.mul(2);
      ForkHelpers.setBalance(strategy.address, totalEthAmount);

      await strategy.reinvest(
        SWAP_TARGET,
        0,
        [],
        EXPECTED_ETH_REWARD,
        SWAP_ETH_DATA,
        REWARD_IN_LUSD,
      );

      expect(await ethers.provider.getBalance(strategy.address)).to.eq(
        EXPECTED_ETH_REWARD,
      );
      expect(await strategy.investedAssets()).to.eq(
        initialInvestment.add(ETH_REWARD_IN_LUSD),
      );
    });

    it('works if strategy holds no LQTY tokens', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      // add only ETH to the strategy
      ForkHelpers.setBalance(strategy.address, EXPECTED_ETH_REWARD);

      await strategy.reinvest(
        SWAP_TARGET,
        0,
        SWAP_LQTY_DATA,
        EXPECTED_ETH_REWARD,
        SWAP_ETH_DATA,
        ETH_REWARD_IN_LUSD,
      );

      // assert no funds remain held by the strategy
      expect(await lusd.balanceOf(strategy.address)).to.eq('0');
      expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');

      expect(await strategy.investedAssets()).to.eq(
        initialInvestment.add(ETH_REWARD_IN_LUSD),
      );
    });

    it('works if ETH amount to reinvest is 0 by reinvesting only swapped LQTY tokens', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      // add only LQTY tokens to the strategy
      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);

      await strategy.reinvest(
        SWAP_TARGET,
        EXPECTED_LQTY_REWARD,
        SWAP_LQTY_DATA,
        0,
        SWAP_ETH_DATA,
        LQTY_REWARD_IN_LUSD,
      );

      expect(await lusd.balanceOf(strategy.address)).to.eq('0');
      expect(await lqty.balanceOf(strategy.address)).to.eq('0');

      expect(await strategy.investedAssets()).to.eq(
        initialInvestment.add(LQTY_REWARD_IN_LUSD),
      );
    });

    it('works if ETH swap data is empty by reinvesting only swapped LQTY tokens', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      // add only LQTY tokens to the strategy
      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);

      await strategy.reinvest(
        SWAP_TARGET,
        EXPECTED_LQTY_REWARD,
        SWAP_LQTY_DATA,
        EXPECTED_ETH_REWARD,
        [],
        LQTY_REWARD_IN_LUSD,
      );

      expect(await lusd.balanceOf(strategy.address)).to.eq('0');
      expect(await lqty.balanceOf(strategy.address)).to.eq('0');

      expect(await strategy.investedAssets()).to.eq(
        initialInvestment.add(LQTY_REWARD_IN_LUSD),
      );
    });

    it('fails if LQTY swap data is incorrect', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);
      ForkHelpers.setBalance(strategy.address, EXPECTED_ETH_REWARD);

      await expect(
        strategy.reinvest(
          SWAP_TARGET,
          EXPECTED_LQTY_REWARD,
          SWAP_ETH_DATA, // send ETH swap data instead of LQTY swap data
          EXPECTED_ETH_REWARD,
          SWAP_ETH_DATA,
          REWARD_IN_LUSD,
        ),
      ).to.be.revertedWith('StrategyLQTYSwapFailed');
    });

    it('fails if ETH swap data is incorrect', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);
      ForkHelpers.setBalance(strategy.address, EXPECTED_ETH_REWARD);

      await expect(
        strategy.reinvest(
          SWAP_TARGET,
          EXPECTED_LQTY_REWARD,
          SWAP_LQTY_DATA,
          EXPECTED_ETH_REWARD,
          SWAP_LQTY_DATA, // send LQTY swap data instead of ETH swap data
          REWARD_IN_LUSD,
        ),
      ).to.be.revertedWith('StrategyETHSwapFailed');
    });

    it("fails if ETH swap amount doesn't match the ETH swap data", async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);
      ForkHelpers.setBalance(strategy.address, EXPECTED_ETH_REWARD);

      await expect(
        strategy.reinvest(
          SWAP_TARGET,
          EXPECTED_LQTY_REWARD,
          SWAP_LQTY_DATA,
          EXPECTED_ETH_REWARD.div(2), // amount is half of the expected
          SWAP_ETH_DATA, // was obtained for EXPECTED_ETH_REWARD amount
          REWARD_IN_LUSD,
        ),
      ).to.be.revertedWith('StrategyETHSwapFailed');
    });

    it('fails if there are no LQTY and ETH assets held by the strategy', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      await expect(
        strategy.reinvest(
          SWAP_TARGET,
          EXPECTED_LQTY_REWARD,
          SWAP_LQTY_DATA,
          EXPECTED_ETH_REWARD,
          SWAP_ETH_DATA,
          0,
        ),
      ).to.be.revertedWith('StrategyNothingToReinvest');
    });

    it('fails on high slippage in the swaps', async () => {
      const initialInvestment = parseUnits('10000');
      await ForkHelpers.mintToken(lusd, strategy.address, initialInvestment);
      await strategy.invest();

      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);
      ForkHelpers.setBalance(strategy.address, EXPECTED_ETH_REWARD);

      await expect(
        strategy.reinvest(
          SWAP_TARGET,
          EXPECTED_LQTY_REWARD,
          SWAP_LQTY_DATA,
          EXPECTED_ETH_REWARD,
          SWAP_ETH_DATA,
          REWARD_IN_LUSD.add(1),
        ),
      ).to.be.revertedWith('StrategyInsufficientOutputAmount');
    });
  });

  describe('#withdrawToVault', () => {
    it('claims rewards and withdraws assets from the stability pool', async () => {
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
      ForkHelpers.setBalance(troveManager.address, ethCollateralToAdd);

      await lqtyStabilityPool
        .connect(troveManager)
        .offset(lusdDebtToOffset, ethCollateralToAdd);

      expect(
        await lqtyStabilityPool.getDepositorLQTYGain(strategy.address),
      ).to.eq(EXPECTED_LQTY_REWARD);
      expect(
        await lqtyStabilityPool.getDepositorETHGain(strategy.address),
      ).to.eq(EXPECTED_ETH_REWARD);

      expect(await lusd.balanceOf(strategy.address)).to.eq('0');
      expect(await lqty.balanceOf(strategy.address)).to.eq('0');
      expect(await ethers.provider.getBalance(strategy.address)).to.eq('0');

      // this will also claim the rewards from the stability pool
      const amountToWithdraw = parseUnits('5000');
      const tx = await strategy
        .connect(admin)
        .withdrawToVault(amountToWithdraw);

      expect(await lusd.balanceOf(strategy.address)).to.eq('0');
      expect(await lqty.balanceOf(strategy.address)).to.eq(
        EXPECTED_LQTY_REWARD,
      );
      expect(await ethers.provider.getBalance(strategy.address)).to.eq(
        EXPECTED_ETH_REWARD,
      );

      expect(await strategy.investedAssets()).to.eq('4998816139652613137823');
      expect(await lusd.balanceOf(vault.address)).to.eq(amountToWithdraw);
      expect(tx)
        .to.emit(strategy, 'StrategyRewardsClaimed')
        .withArgs(EXPECTED_LQTY_REWARD, EXPECTED_ETH_REWARD);
    });
  });
});
