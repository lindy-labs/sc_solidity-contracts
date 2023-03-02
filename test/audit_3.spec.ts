import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@openzeppelin/test-helpers';
import { ethers, deployments } from 'hardhat';
import { expect } from 'chai';
import { BigNumber } from 'ethers';

import {
  Vault,
  Vault__factory,
  MockLUSD__factory,
  MockLUSD,
} from '../typechain';
import { depositParams, claimParams } from './shared/factories';
import { moveForwardTwoWeeks, generateNewAddress } from './shared';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

describe('Audit Tests 3', () => {
  let owner: SignerWithAddress;
  let depositor1: SignerWithAddress;
  let depositor2: SignerWithAddress;
  let depositor3: SignerWithAddress;
  let depositor4: SignerWithAddress;
  let depositor5: SignerWithAddress;
  let claimer1: SignerWithAddress;
  let claimer2: SignerWithAddress;

  let underlying: MockLUSD;
  let vault: Vault;

  const TWO_WEEKS = BigNumber.from(time.duration.weeks(2).toNumber());
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from('00');
  const INVESTMENT_FEE_PCT = BigNumber.from('200');
  const INVEST_PCT = BigNumber.from('9000');

  const fixtures = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture(['vault']);

    [owner] = await ethers.getSigners();

    const lusdDeployment = await deployments.get('LUSD');
    const lusdVaultDeployment = await deployments.get('Yearn_LUSD_Vault');

    underlying = MockLUSD__factory.connect(lusdDeployment.address, owner);
    vault = Vault__factory.connect(lusdVaultDeployment.address, owner);
  });

  beforeEach(() => fixtures());

  beforeEach(async () => {
    [
      owner,
      depositor1,
      depositor2,
      depositor3,
      depositor4,
      depositor5,
      claimer1,
      claimer2,
    ] = await ethers.getSigners();

    let Vault = await ethers.getContractFactory('Vault');

    vault = await Vault.deploy(
      underlying.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      owner.address,
      PERFORMANCE_FEE_PCT,
      INVESTMENT_FEE_PCT,
      [],
      0,
    );

    await underlying.connect(owner).approve(vault.address, MaxUint256);
    await underlying.connect(depositor1).approve(vault.address, MaxUint256);
    await underlying.connect(depositor2).approve(vault.address, MaxUint256);
    await underlying.connect(depositor3).approve(vault.address, MaxUint256);
    await underlying.connect(depositor4).approve(vault.address, MaxUint256);
    await underlying.connect(depositor5).approve(vault.address, MaxUint256);
  });

  async function commonSteps() {
    await addUnderlyingBalance(depositor1, '100000');
    await addUnderlyingBalance(depositor2, '100000');
    await addUnderlyingBalance(depositor3, '100000');
    await addUnderlyingBalance(depositor4, '100000');
    await addUnderlyingBalance(depositor5, '48000');

    // ## depositor1 deposits
    await vault.connect(depositor1).deposit(
      depositParams.build({
        amount: parseUnits('100000'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(claimer1.address).build()],
      }),
    );

    // ## depositor2 deposits
    await vault.connect(depositor2).deposit(
      depositParams.build({
        amount: parseUnits('100000'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(claimer1.address).build()],
      }),
    );

    // ## depositor3 deposits
    await vault.connect(depositor3).deposit(
      depositParams.build({
        amount: parseUnits('100000'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(claimer2.address).build()],
      }),
    );

    // ## depositor4 deposits
    await vault.connect(depositor4).deposit(
      depositParams.build({
        amount: parseUnits('100000'),
        inputToken: underlying.address,
        claims: [claimParams.percent(100).to(claimer2.address).build()],
      }),
    );

    expect(await underlying.balanceOf(vault.address)).to.eq(
      parseUnits('400000'),
    ); // vault: 400k

    // ## add yield
    await addYieldToVault('100000');
    expect(await underlying.balanceOf(vault.address)).to.eq(
      parseUnits('500000'),
    ); // vault: 500k = 400k + 100k

    // ## claimer1 claimYield
    expect(await underlying.balanceOf(claimer1.address)).to.eq(parseUnits('0'));
    await vault.connect(claimer1).claimYield(claimer1.address);
    expect(await underlying.balanceOf(claimer1.address)).to.eq(
      parseUnits('50000'),
    ); // claimer: 50k = 0 + 50k
    expect(await underlying.balanceOf(vault.address)).to.eq(
      parseUnits('450000'),
    ); // vault: 450k = 500k - 50k

    // ## price per share: 1.25 -> 1.2 (lost 18k)
    await removeUnderlyingFromVault('18000');
    expect(await underlying.balanceOf(vault.address)).to.eq(
      parseUnits('432000'),
    ); // vault: 432k = 450k - 18k
  }

  it('case 1', async () => {
    await commonSteps();

    await moveForwardTwoWeeks();

    expect(await underlying.balanceOf(depositor1.address)).to.eq(
      parseUnits('0'),
    );
    expect(await underlying.balanceOf(depositor2.address)).to.eq(
      parseUnits('0'),
    );
    expect(await underlying.balanceOf(depositor3.address)).to.eq(
      parseUnits('0'),
    );
    expect(await underlying.balanceOf(depositor4.address)).to.eq(
      parseUnits('0'),
    );

    // ## depositor1 withdraw
    await vault.connect(depositor1).forceWithdraw(depositor1.address, [1]);
    // expect depositor1 forceWithdraw 96k but:
    console.log(
      'depositor1 underlying balance: ' +
        (await underlying.balanceOf(depositor1.address)),
    );

    // ## depositor2 withdraw
    await vault.connect(depositor2).forceWithdraw(depositor2.address, [2]);
    // expect depositor2 forceWithdraw 96k but:
    console.log(
      'depositor2 underlying balance: ' +
        (await underlying.balanceOf(depositor2.address)),
    );

    // ## claimer2 claimYield
    expect(await underlying.balanceOf(claimer2.address)).to.eq(parseUnits('0'));
    await vault.connect(claimer2).claimYield(claimer2.address);
    expect(await underlying.balanceOf(claimer2.address)).to.eq(
      parseUnits('40000').sub(1),
    );

    // ## depositor3 withdraw
    expect(await underlying.balanceOf(depositor3.address)).to.eq(
      parseUnits('0'),
    );
    // expect depositor3 can normally withdraw
    await vault.connect(depositor3).withdraw(depositor3.address, [3]);
    expect(await underlying.balanceOf(depositor3.address)).to.eq(
      parseUnits('100000').sub(1),
    );
    console.log(
      'depositor3 underlying balance: ' +
        (await underlying.balanceOf(depositor3.address)),
    );
    // ## depositor4 withdraw
    expect(await underlying.balanceOf(depositor4.address)).to.eq(
      parseUnits('0'),
    );
    // expect depositor4 can normally withdraw
    await vault.connect(depositor4).withdraw(depositor4.address, [4]);
    console.log(
      'depositor4 underlying balance: ' +
        (await underlying.balanceOf(depositor4.address)),
    );

    console.log(
      'claimer1 underlying balance: ' +
        (await underlying.balanceOf(claimer1.address)),
    );
    console.log(
      'claimer2 underlying balance: ' +
        (await underlying.balanceOf(claimer2.address)),
    );
    console.log(
      'vault underlying balance: ' +
        (await underlying.balanceOf(vault.address)),
    );
  });

  it('case 2', async () => {
    await commonSteps();

    // ## depositor5 canno withdraw because claimer is in debt
    await expect(
      vault.connect(depositor5).deposit(
        depositParams.build({
          amount: parseUnits('48000'),
          inputToken: underlying.address,
          claims: [claimParams.percent(100).to(claimer1.address).build()],
        }),
      ),
    ).revertedWith('VaultCannotDepositWhenClaimerInDebt');

    await moveForwardTwoWeeks();

    expect(await underlying.balanceOf(depositor1.address)).to.eq(
      parseUnits('0'),
    );
    expect(await underlying.balanceOf(depositor2.address)).to.eq(
      parseUnits('0'),
    );
    expect(await underlying.balanceOf(depositor3.address)).to.eq(
      parseUnits('0'),
    );
    expect(await underlying.balanceOf(depositor4.address)).to.eq(
      parseUnits('0'),
    );

    // ## depositor1 withdraw
    await expect(
      vault.connect(depositor1).withdraw(depositor1.address, [1]),
    ).to.revertedWith('VaultMustUseForceWithdrawToAcceptLosses');

    await vault.connect(depositor1).forceWithdraw(depositor1.address, [1]);

    expect(await underlying.balanceOf(depositor1.address)).to.eq(
      parseUnits('96000'),
    );

    // ## depositor2 withdraw
    await vault.connect(depositor2).forceWithdraw(depositor2.address, [2]);

    expect(await underlying.balanceOf(depositor1.address)).to.eq(
      parseUnits('96000'),
    );

    // ## claimer2 claimYield
    expect(await underlying.balanceOf(claimer2.address)).to.eq(parseUnits('0'));
    await vault.connect(claimer2).claimYield(claimer2.address);
    expect(await underlying.balanceOf(claimer2.address)).to.eq(
      parseUnits('40000').sub(1),
    );

    // ## depositor3 withdraw
    expect(await underlying.balanceOf(depositor3.address)).to.eq(
      parseUnits('0'),
    );
    // expect depositor3 can normally withdraw but must use forceWithdraw
    await vault.connect(depositor3).forceWithdraw(depositor3.address, [3]);
    expect(await underlying.balanceOf(depositor3.address)).to.eq(
      parseUnits('100000').sub(1),
    );
    console.log(
      'depositor3 underlying balance: ' +
        (await underlying.balanceOf(depositor3.address)),
    );

    // ## depositor4 withdraw
    expect(await underlying.balanceOf(depositor4.address)).to.eq(
      parseUnits('0'),
    );
    // expect depositor4 can normally withdraw but must use forceWithdraw
    await vault.connect(depositor4).forceWithdraw(depositor4.address, [4]);
    console.log(
      'depositor4 underlying balance: ' +
        (await underlying.balanceOf(depositor4.address)),
    );

    console.log(
      'claimer1 underlying balance: ' +
        (await underlying.balanceOf(claimer1.address)),
    );
    console.log(
      'claimer2 underlying balance: ' +
        (await underlying.balanceOf(claimer2.address)),
    );
    console.log(
      'vault underlying balance: ' +
        (await underlying.balanceOf(vault.address)),
    );
  });

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
