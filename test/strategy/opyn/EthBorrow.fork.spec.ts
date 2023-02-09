import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { BigNumber } from 'bignumber.js';
import { forkToMainnet } from '../../shared/forkHelpers';
import { parseUnits } from 'ethers/lib/utils';
import { expect } from 'chai';
import {
  getOptimumEthToBorrow,
  getCrabVault,
} from '../../../scripts/crab/ethToBorrow';

describe('Opyn Crab Strategy ethBorrow test', () => {
  let admin: SignerWithAddress;

  beforeEach(async () => {
    forkToMainnet(16578923);
    [admin] = await ethers.getSigners();
  });

  describe('ethLeftOver after calling crab flashDeposit must be very little', async () => {
    it('for 10 ETH', async () => {
      await calcEthLeftOverAfterFlashDeposit(
        new BigNumber(parseUnits('10', 'ether').toString()),
      );
    });

    it('for 50 ETH', async () => {
      await calcEthLeftOverAfterFlashDeposit(
        new BigNumber(parseUnits('50', 'ether').toString()),
      );
    });

    it('for 110 ETH', async () => {
      await calcEthLeftOverAfterFlashDeposit(
        new BigNumber(parseUnits('110', 'ether').toString()),
      );
    });

    it.only('for 500 ETH', async () => {
      await calcEthLeftOverAfterFlashDeposit(
        new BigNumber(parseUnits('500', 'ether').toString()),
      );
    });
  });

  const calcEthLeftOverAfterFlashDeposit = async (ethToDeposit: BigNumber) => {
    const crab = getCrabVault(admin);

    const adminEthBalance = await admin.getBalance();

    const optimumratio = await getOptimumEthToBorrow(ethToDeposit, admin);

    await crab.flashDeposit(ethToDeposit.times(optimumratio).toString(), 3000, {
      value: ethToDeposit.toString(),
    });

    // console.log(optimumratio);
    const newBalance = await admin.getBalance();

    const ethLeftOver = adminEthBalance
      .sub(newBalance)
      .sub(ethToDeposit.toString())
      .abs();

    // assert ethLeftOver is less than .1 % of ethToDeposit
    expect(ethLeftOver).to.be.lt(ethToDeposit.times(0.001).toString());

    console.log(
      `ETH Left Over is ${new BigNumber(ethLeftOver.toString())
        .div(ethToDeposit)
        .times(100)
        .toFixed(5)} percent of ethDeposit`,
    );
  };
});
