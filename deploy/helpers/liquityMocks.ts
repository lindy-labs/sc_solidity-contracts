import { HardhatRuntimeEnvironment } from 'hardhat/types';

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

  const mock0x = await deploy(`${prefix}_Mock0x`, {
    contract: 'Mock0x',
    from: deployer,
    args: [],
    log: true,
  });

  if (getNetworkName() !== 'hardhat' && getNetworkName() !== 'docker') {
    const priceFeedVerification = env.run('verify:verify', {
      address: mockLiquityPriceFeedDeployment.address,
      constructorArguments: [],
    });

    const troveManagerVerification = env.run('verify:verify', {
      address: troveManagerDeployment.address,
      constructorArguments: troveManagerDeploymentArgs,
    });

    const stabilityPoolVerification = env.run('verify:verify', {
      address: mockLiquityStabilityPool.address,
      constructorArguments: liquityStabilityPoolArgs,
    });

    const mock0xVerification = env.run('verify:verify', {
      address: mock0x.address,
      constructorArguments: [],
    });

    const promises = [
      priceFeedVerification,
      troveManagerVerification,
      stabilityPoolVerification,
      mock0xVerification,
    ];

    await Promise.allSettled(promises).then((results) =>
      results.forEach((result) => {
        if (result.status === 'rejected') {
          console.error((result.reason as Error).message);
        }
      }),
    );
  }

  return { mock0x };
}
