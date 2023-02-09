import { BigNumber } from 'bignumber.js';
import { ICrabStrategyV2__factory } from '../../typechain';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { parseUnits } from 'ethers/lib/utils';

const crabStrategyVaultAtomV2 = '0x3B960E47784150F5a63777201ee2B15253D713e8';

export const getCrabVault = (signer: SignerWithAddress) =>
  ICrabStrategyV2__factory.connect(crabStrategyVaultAtomV2, signer);

export const getOptimumEthToBorrow = async (
  ethToDeposit: BigNumber,
  signer: SignerWithAddress,
) => {
  /**
   *Taking a simple trial and error approach to find the optimum ratio
   * Starting from the optimum 1.995 ratio, and decrease it until the flashDeposit gives an error
   * The greatest number below 1.995 at which flashDeposit does not give an error must be the closest
   * to the optimum ratio
   */
  const crab = getCrabVault(signer);

  let optimumratio = 1.995;
  let decreaser = 0.0002;

  // This is done to speed up the decreasing of the optimum ratio for higher ethToDeposits
  // because higher ethToDeposits generally have optimumRatio around 1.7-1.8 range
  if (ethToDeposit.gt(parseUnits('100', 'ether').toString())) {
    decreaser += ethToDeposit
      .div(parseUnits('100', 'ether').toString())
      .integerValue(BigNumber.ROUND_DOWN)
      .times(0.0005)
      .toNumber();
  }

  let flag = true;
  while (flag) {
    try {
      await crab.estimateGas.flashDeposit(
        ethToDeposit.times(optimumratio).toString(),
        3000,
        {
          value: ethToDeposit.toString(),
        },
      );

      flag = false;
    } catch {
      optimumratio -= decreaser;
      console.log(optimumratio);
    }
  }

  return optimumratio;
};
