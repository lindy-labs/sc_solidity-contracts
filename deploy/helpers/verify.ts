import { Contract } from 'ethers';
import { Deployment } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

async function verify(env: HardhatRuntimeEnvironment, args: any) {
  try {
    return env.run('verify:verify', args);
  } catch (e) {
    console.error(e);
  }
}

export async function verifyContracts(
  env: HardhatRuntimeEnvironment,
  contracts: Array<Deployment | Contract>,
) {
  let deployments = [];

  contracts.forEach((token) => {
    deployments.push(
      verify(env, {
        address: token.address,
        constructorArguments: [0],
      }),
    );
  });

  await Promise.all(deployments);
}

verify.skip = async (hre: HardhatRuntimeEnvironment) => true;

export default verify;
