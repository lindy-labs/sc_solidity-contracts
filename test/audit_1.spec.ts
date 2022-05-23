import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';
import { Contract, BigNumber } from 'ethers';

import {
  Vault,
  MockUST,
  MockStrategy,
  MockAUST__factory,
  MockUST__factory,
  Vault__factory,
} from '../typechain';
import { depositParams, claimParams } from './shared/factories';
import {
  moveForwardTwoWeeks,
  SHARES_MULTIPLIER,
  generateNewAddress,
} from './shared';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('Integration', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;

  let mockEthAnchorRouter: Contract;
  let mockAUstUstFeed: Contract;

  let underlying: MockUST;
  let aUstToken: Contract;
  let vault: Vault;
  let strategy: MockStrategy;

  const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('00');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');
  const INVEST_PCT = BigNumber.from('9000');

  const fixtures = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture(['vaults']);

    [owner] = await ethers.getSigners();

    const ustDeployment = await deployments.get('UST');
    const austDeployment = await deployments.get('aUST');
    const ustVaultDeployment = await deployments.get('Vault_UST');

    aUstToken = MockAUST__factory.connect(austDeployment.address, owner);
    underlying = MockUST__factory.connect(ustDeployment.address, owner);
    vault = Vault__factory.connect(ustVaultDeployment.address, owner);
  });

  beforeEach(() => fixtures());

  beforeEach(async () => {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    let Vault = await ethers.getContractFactory('Vault');
    let MockStrategy = await ethers.getContractFactory('MockStrategy');

    const MockEthAnchorRouterFactory = await ethers.getContractFactory(
      'MockEthAnchorRouter',
    );
    mockEthAnchorRouter = await MockEthAnchorRouterFactory.deploy(
      underlying.address,
      aUstToken.address,
    );

    const MockChainlinkPriceFeedFactory = await ethers.getContractFactory(
      'MockChainlinkPriceFeed',
    );
    mockAUstUstFeed = await MockChainlinkPriceFeedFactory.deploy(18);

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
    underlying.connect(charlie).approve(vault.address, MaxUint256);

    strategy = await MockStrategy.deploy(
      vault.address,
      mockEthAnchorRouter.address,
      mockAUstUstFeed.address,
      underlying.address,
      aUstToken.address,
    );
  });

  it('two deposits, single claimer. should fair for depositors', async () => {
    await wrongCase();
  });

  async function wrongCase() {
    const [claimer, depositor1, depositor2] = [alice, bob, charlie];

    await addUnderlyingBalance(depositor1, '100000');
    await addUnderlyingBalance(depositor2, '100000');

    expect(await underlying.balanceOf(depositor1.address)).to.eq(
      parseUnits('100000'),
    ); // depositor1 has 100000 underlying
    expect(await underlying.balanceOf(depositor2.address)).to.eq(
      parseUnits('100000'),
    ); // depositor2 has 100000 underlying

    // ## depositor1 deposits
    await vault.connect(depositor1).deposit(
      depositParams.build({
        amount: parseUnits('100000'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(claimer.address).build()],
      }),
    );

    const deposit1 = await vault.deposits(1);
    expect(deposit1.owner).to.equal(depositor1.address);
    expect(deposit1.amount).to.equal(parseUnits('100000'));

    expect(await vault.totalShares()).to.equal(
      parseUnits('100000').mul(SHARES_MULTIPLIER),
    );
    expect(await vault.principalOf(claimer.address)).to.equal(
      parseUnits('100000'),
    );

    // ## depositor2 deposits
    await vault.connect(depositor2).deposit(
      depositParams.build({
        amount: parseUnits('100000'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(claimer.address).build()],
      }),
    );

    const deposit2 = await vault.deposits(2);
    expect(deposit2.owner).to.equal(depositor2.address);
    expect(deposit2.amount).to.equal(parseUnits('100000'));

    expect(await vault.totalShares()).to.equal(
      parseUnits('200000').mul(SHARES_MULTIPLIER),
    );
    expect(await vault.principalOf(claimer.address)).to.equal(
      parseUnits('200000'),
    );

    expect(await underlying.balanceOf(depositor1.address)).to.eq(
      parseUnits('0'),
    ); // depositor1: 100000 -> 0
    expect(await underlying.balanceOf(depositor2.address)).to.eq(
      parseUnits('0'),
    ); // depositor2: 100000 -> 0
    expect(await underlying.balanceOf(vault.address)).to.eq(
      parseUnits('200000'),
    ); // vault: 0 -> 200000

    // ## add yield
    await addYieldToVault('40000');
    expect(await underlying.balanceOf(vault.address)).to.eq(
      parseUnits('240000'),
    ); // vault: 200000 -> 240000

    // ## claimer
    expect(await underlying.balanceOf(claimer.address)).to.eq(parseUnits('0'));
    await vault.connect(claimer).claimYield(claimer.address);
    expect(await underlying.balanceOf(claimer.address)).to.eq(
      parseUnits('40000').sub(1),
    ); // claimer: 0 -> 40000 - 1
    expect(await underlying.balanceOf(vault.address)).to.eq(
      parseUnits('200000').add(1),
    ); // vault: 240000 -> 200001

    // ## restore price per share
    await removeUnderlyingFromVault('30000');
    expect(await underlying.balanceOf(vault.address)).to.eq(
      parseUnits('170000').add(1),
    ); // vault: 200001 -> 170001

    await moveForwardTwoWeeks();

    // ## depositor1 withdraw
    expect(await underlying.balanceOf(depositor1.address)).to.eq(
      parseUnits('0'),
    );

    await expect(
      vault.connect(depositor1).withdraw(depositor1.address, [1]),
    ).to.revertedWith('VaultCannotWithdrawWhenYieldNegative'); // FIXED!

    await vault.connect(depositor1).forceWithdraw(depositor1.address, [1]);

    expect(await underlying.balanceOf(vault.address)).to.eq(
      parseUnits('85000').add(1),
    ); // vault: 170001 -> 70002  (sub 100000 - 1) FIXED!!!
    expect(await underlying.balanceOf(depositor1.address)).to.eq(
      parseUnits('85000'),
    ); // depositor1: 0 -> 100000 - 1 (add 100000 - 1) FIXED!!!

    // ## depositor2 withdraw
    expect(await underlying.balanceOf(depositor2.address)).to.eq(
      parseUnits('0'),
    );
    await vault.connect(depositor2).forceWithdraw(depositor2.address, [2]);
    expect(await underlying.balanceOf(vault.address)).to.eq(parseUnits('0')); // vault: 70002 -> 0 (sub 70002)
    expect(await underlying.balanceOf(depositor2.address)).to.eq(
      parseUnits('85000').add(1),
    ); // depositor2: 0 -> 70002 (add 70002) FIXED!!!
  }

  function addYieldToVault(amount: string) {
    return underlying.mint(vault.address, parseUnits(amount));
  }

  function removeUnderlyingFromVault(amount: string) {
    return underlying.burn(vault.address, parseUnits(amount));
  }

  async function addUnderlyingBalance(
    account: SignerWithAddress,
    amount: string,
  ) {
    await underlying.mint(account.address, parseUnits(amount));
  }
});
