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

  const FORK_BLOCK = 15927938;
  const SWAP_TARGET = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';
  const LQTY_SWAP_AMOUNT = parseUnits('1000');
  // cached response data for swapping LQTY->ETH from `https://api.0x.org/swap/v1/quote?buyToken=ETH&sellToken=${LQTY}&sellAmount=${LQTY_SWAP_AMOUNT}` at FORK_BLOCK
  const LQTY_TO_ETH_SWAP_DATA =
    '0x803ba26d000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000003635c9adc5dea00000000000000000000000000000000000000000000000000000070b6eb221134e080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002b6dea81c8171d0ba574754ef6f8b412f2ed88c54d000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000869584cd0000000000000000000000001000000000000000000000000000000000000011000000000000000000000000000000000000000000000085e2bac849636ac6e7';
  const EXPECTED_ETH_FOR_SWAP = BigNumber.from('512748580148949632');

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

  describe('#swapLQTYtoETH', () => {
    it('should swap LQTY to ETH', async () => {
      const initialLqtyBalance = parseUnits('2000');
      await ForkHelpers.mintToken(lqty, strategy.address, initialLqtyBalance);

      expect(await getETHBalance(strategy.address)).to.eq(0);

      await strategy.swapLQTYtoETH(
        SWAP_TARGET,
        LQTY_SWAP_AMOUNT,
        LQTY_TO_ETH_SWAP_DATA,
        EXPECTED_ETH_FOR_SWAP,
      );

      expect(await getETHBalance(strategy.address)).to.eq(
        EXPECTED_ETH_FOR_SWAP,
      );
      expect(await lqty.balanceOf(strategy.address)).to.eq(
        initialLqtyBalance.sub(LQTY_SWAP_AMOUNT),
      );
    });
  });

  describe('#transferYield', () => {
    it('transfers yield in ETH to the user', async () => {
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

      expect(await lusd.balanceOf(vault.address)).to.eq('0');

      // add 1 ETH in yield (1258.882537168268713168 in LUSD)
      await ForkHelpers.setBalance(strategy.address, parseUnits('1'));

      expect(await (await vault.yieldFor(alice.address)).claimableYield).to.eq(
        '1258882537168268713168', // in LUSD
      );

      const alicesInitialEthBalace = await getETHBalance(alice.address);

      await vault.connect(alice).claimYield(alice.address);

      // the difference between expected 1 ETH and the received amount as yield of 0.997102428861882886 ETH
      // comes from gas costs and estimating current ETH price in LUSD, because yield is denominated in the vault in LUSD
      // this also means that some small amount of yield for alice is left uncalimed
      expect(await getETHBalance(alice.address)).to.eq(
        alicesInitialEthBalace.add('997102428861882886'),
      );
      expect(await lusd.balanceOf(vault.address)).to.eq('0');
      expect((await vault.yieldFor(alice.address)).claimableYield).to.eq(
        '2882873236925869777', // in LUSD
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

      // add 1 ETH + 100 LUSD in yield (1358.882537168268713168 in LUSD)
      ForkHelpers.setBalance(strategy.address, parseUnits('1'));
      await ForkHelpers.mintToken(lusd, strategy.address, parseUnits('100'));
      await strategy.invest();

      expect((await vault.yieldFor(alice.address)).claimableYield).to.eq(
        '1358882537168268713168', // in LUSD
      );

      const alicesInitialEthBalace = await getETHBalance(alice.address);

      const tx = await vault.connect(alice).claimYield(alice.address);

      expect(await getETHBalance(alice.address)).to.eq(
        alicesInitialEthBalace
          .sub(await getTransactionGasCost(tx))
          .add(parseUnits('1')),
      );
      // the difference in alice's end LUSD balance of ~97.16 and expected 100 LUSD comes from the differece in LUSD to ETH and ETH to LUSD exchange rates
      // this means that some small amount yield for alice (~2.84 LUSD) is left in the vault after the yield was claimed
      expect(await lusd.balanceOf(alice.address)).to.eq('97160101407531212992');
      expect((await vault.yieldFor(alice.address)).claimableYield).to.eq(
        '2839898592468787007', // in LUSD
      );
    });
  });
});
