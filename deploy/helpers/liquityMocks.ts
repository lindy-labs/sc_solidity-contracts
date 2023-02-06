import { HardhatRuntimeEnvironment } from 'hardhat/types';

import verify from './verify';

export default async function (env: HardhatRuntimeEnvironment, prefix: string) {
  const { get, deploy, getNetworkName } = env.deployments;
  const { deployer } = await env.getNamedAccounts();

  const LUSDDeployment = await get('LUSD');

  const mockLiquityPriceFeedDeployment = await deploy(`${prefix}_Price_Feed`, {
    contract: 'MockLiquityPriceFeed',
    from: deployer,
    log: true,
    args: [],
  });

  const liquityStabilityPoolArgs = [
    LUSDDeployment.address,
    mockLiquityPriceFeedDeployment.address,
  ];
  const mockLiquityStabilityPool = await deploy(`${prefix}_Stability_Pool`, {
    contract: 'MockStabilityPool',
    from: deployer,
    args: liquityStabilityPoolArgs,
    log: true,
  });

  const troveManagerDeploymentArgs = [
    mockLiquityStabilityPool.address,
    mockLiquityPriceFeedDeployment.address,
  ];
  const troveManagerDeployment = await deploy(`${prefix}_Trove_Manager`, {
    contract: 'MockTroveManager',
    from: deployer,
    log: true,
    args: troveManagerDeploymentArgs,
  });

  if (getNetworkName() !== 'hardhat' && getNetworkName() !== 'docker') {
    const priceFeedVerification = verify(env, {
      address: mockLiquityPriceFeedDeployment.address,
      constructorArguments: [],
    });

    const troveManagerVerification = verify(env, {
      address: troveManagerDeployment.address,
      constructorArguments: troveManagerDeploymentArgs,
    });

    const stabilityPoolVerification = verify(env, {
      address: mockLiquityStabilityPool.address,
      constructorArguments: liquityStabilityPoolArgs,
    });

    const promises = [
      priceFeedVerification,
      troveManagerVerification,
      stabilityPoolVerification,
    ];

    await Promise.allSettled(promises).then((results) =>
      results.forEach((result) => {
        if (result.status === 'rejected') {
          console.error((result.reason as Error).message);
        }
      }),
    );
  }
}
