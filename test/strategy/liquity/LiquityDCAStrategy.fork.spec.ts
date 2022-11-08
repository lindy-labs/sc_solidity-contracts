import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, constants, utils } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';

import {
  claimParams,
  depositParams,
  ForkHelpers,
  generateNewAddress,
  getTransactionGasCost,
  getETHBalance,
  moveForwardTwoWeeks,
} from '../../shared';

import {
  Vault,
  ERC20,
  ERC20__factory,
  IStabilityPool,
  IStabilityPool__factory,
  LiquityDCAStrategy,
} from '../../../typechain';

const { parseUnits } = ethers.utils;

describe('Liquity DCA Strategy (mainnet fork tests)', () => {
  let admin: SignerWithAddress;
  let alice: SignerWithAddress;

  let vault: Vault;
  let lqtyStabilityPool: IStabilityPool;
  let lusd: ERC20;
  let lqty: ERC20;
  let strategy: LiquityDCAStrategy;

  const TWO_WEEKS = time.duration.days(14).toNumber();
  const INVEST_PCT = 10000; // set 100% for test
  const INVESTMENT_FEE_PCT = 0; // set 0% for test
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('0');
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE'));

  // mainnet addresses
  const STABILITY_POOL = '0x66017d22b0f8556afdd19fc67041899eb65a21bb';
  const CURVE_EXCHANGE = '0x81c46feca27b31f3adc2b91ee4be9717d1cd3dd7';
  const LUSD = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
  const LQTY = '0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D';

  const FORK_BLOCK = 15269696;
  // reward from stability pool received in LQTY tokens
  const EXPECTED_LQTY_REWARD = BigNumber.from('39553740600841980000');
  // reward from stability pool received in ETH
  const EXPECTED_ETH_REWARD = BigNumber.from('1183860347390000');
  // amount of LUSD received for swapping LQTY reward
  const LQTY_REWARD_IN_LUSD = BigNumber.from('35086994728790148965');
  // address of the '0x' contract performing the token swap
  const SWAP_TARGET = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';
  // cached response data for swapping LQTY->LUSD from `https://api.0x.org/swap/v1/quote?buyToken=${LUSD}&sellToken=${lqty.address}&sellAmount=${39553740600841980000}` at FORK_BLOCK
  const SWAP_LQTY_DATA =
    '0xd9627aa4000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000224eb1d830321c860000000000000000000000000000000000000000000000001d9fa402217f685ac000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000030000000000000000000000006dea81c8171d0ba574754ef6f8b412f2ed88c54d000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000005f98805a4e8be255a32880fdec7f6728c6568ba0869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000a644841b4262ea7823';

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);

    [admin, alice] = await ethers.getSigners();

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

    const LiquityDCAStrategyFactory = await ethers.getContractFactory(
      'LiquityDCAStrategy',
    );

    const strategyProxy = await upgrades.deployProxy(
      LiquityDCAStrategyFactory,
      [
        vault.address,
        admin.address,
        lqtyStabilityPool.address,
        lqty.address,
        lusd.address,
        admin.address, // keeper
        0,
        CURVE_EXCHANGE,
      ],
      {
        kind: 'uups',
      },
    );

    await strategyProxy.deployed();

    strategy = LiquityDCAStrategyFactory.attach(strategyProxy.address);

    await vault.setStrategy(strategy.address);
    await strategy.grantRole(MANAGER_ROLE, admin.address);

    await lusd
      .connect(admin)
      .approve(vault.address, ethers.constants.MaxUint256);
    await strategy.connect(admin).allowSwapTarget(SWAP_TARGET);

    await lusd.connect(alice).approve(vault.address, constants.MaxUint256);
  });

  describe('#transferYield', () => {
    it('transfers yield in ETH to the user', async () => {
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

      await strategy.harvest();

      const alicesInitialEthBalace = await getETHBalance(alice.address);

      // we got little more than 1.9 LUSD in ETH rewards
      await strategy.transferYield(alice.address, parseUnits('1.9'));

      expect(await getETHBalance(alice.address)).to.eq(
        alicesInitialEthBalace.add('1168664919817534'),
      );
    });

    it('transfers the whole yield in LUSD and ETH to the user when the ETH balance < yield', async () => {
      const depositAmount = parseUnits('1000');
      await ForkHelpers.mintToken(lusd, alice, depositAmount);

      await vault.connect(alice).deposit(
        depositParams.build({
          amount: depositAmount,
          inputToken: lusd.address,
          claims: [claimParams.percent(100).to(alice.address).build()],
        }),
      );

      await vault.updateInvested();

      await ForkHelpers.mintToken(lqty, strategy.address, EXPECTED_LQTY_REWARD);
      ForkHelpers.setBalance(strategy.address, EXPECTED_ETH_REWARD);

      await strategy.reinvest(
        SWAP_TARGET,
        EXPECTED_LQTY_REWARD,
        SWAP_LQTY_DATA,
        0,
        [],
        LQTY_REWARD_IN_LUSD,
      );

      expect(await lqty.balanceOf(strategy.address)).to.eq('0');
      expect(await getETHBalance(strategy.address)).to.eq(EXPECTED_ETH_REWARD);
      expect(await lusd.balanceOf(alice.address)).to.eq('0');

      const alicesInitialEthBalace = await getETHBalance(alice.address);

      const tx = await vault.connect(alice).claimYield(alice.address);

      expect(await getETHBalance(alice.address)).to.eq(
        alicesInitialEthBalace
          .sub(await getTransactionGasCost(tx))
          .add(EXPECTED_ETH_REWARD),
      );
      // the difference in alice's end LUSD balance and LQTY_REWARD_IN_LUSD comes from the differece in LUSD to ETH and ETH to LUSD exchange rates
      // LQTY_REWARD_IN_LUSD - alice's end LUSD balance = 35086994728790148965 LUSD - 35083162034198358098 LUSD = 3832694591790867 LUSD
      // this means that some small amount yield for alice (3832694591790866) is left in the vault ater the #claimYield call
      expect(await lusd.balanceOf(alice.address)).to.eq('35083162034198358098');
      expect((await vault.yieldFor(alice.address)).claimableYield).to.eq(
        '3832694591790866', // includes rounding error
      );

      expect(await vault.totalPrincipal()).to.eq(depositAmount);
      expect(await vault.totalUnderlying()).to.eq(
        (await vault.totalPrincipal()).add('3832694591790867'),
      );
    });
  });
});
