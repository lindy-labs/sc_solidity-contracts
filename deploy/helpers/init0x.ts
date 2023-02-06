import { HardhatRuntimeEnvironment } from 'hardhat/types';
import verify from './verify';

const MAINNET_0X_SWAP_TARGET = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';

export default async function init0x(env: HardhatRuntimeEnvironment) {
  const { deploy, getNetworkName } = env.deployments;

  if (getNetworkName() === 'mainnet') return MAINNET_0X_SWAP_TARGET;

  const { deployer } = await env.getNamedAccounts();

  const mock0x = await deploy(`Mock0x`, {
    contract: 'Mock0x',
    from: deployer,
    args: [],
    log: true,
  });

  if (getNetworkName() !== 'hardhat' && getNetworkName() !== 'docker') {
    await verify(env, {
      address: mock0x.address,
      constructorArguments: [],
    });
  }

  return mock0x.address;
}
