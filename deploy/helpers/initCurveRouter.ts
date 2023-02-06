import { HardhatRuntimeEnvironment } from 'hardhat/types';
import verify from './verify';

const MAINNET_CURVE_ROUTER = '0x81C46fECa27B31F3ADC2b91eE4be9717d1cd3DD7';

export default async function (env: HardhatRuntimeEnvironment) {
  const { deploy, getNetworkName } = env.deployments;

  if (getNetworkName() === 'mainnet') return MAINNET_CURVE_ROUTER;

  const { deployer } = await env.getNamedAccounts();

  const curveRouter = await deploy(`MockCurveExchange`, {
    contract: 'MockCurveExchange',
    from: deployer,
    args: [],
    log: true,
  });

  if (getNetworkName() !== 'hardhat' && getNetworkName() !== 'docker') {
    await verify(env, {
      address: curveRouter.address,
      constructorArguments: [],
    });
  }

  return curveRouter.address;
}
