import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { includes } from 'lodash';
import { parseUnits } from 'ethers/lib/utils';

const func = async function (env: HardhatRuntimeEnvironment) {
  const [owner, _alice, _bob] = await ethers.getSigners();
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;

  // Deploy and gather needed mock contracts

  const mockLiquityPriceFeedDeployment = await deploy('LiquityPriceFeed', {
    contract: 'MockLiquityPriceFeed',
    from: deployer,
    log: true,
    args: [],
  });
  const liquityPriceFeed = await ethers.getContractAt(
    'MockLiquityPriceFeed',
    mockLiquityPriceFeedDeployment.address,
  );

  await liquityPriceFeed.setPrice(parseUnits('1700', 18));

  const stabilityPoolDeployment = await get('LiquityStabilityPool');
  const stabilityPool = await ethers.getContractAt(
    'MockStabilityPool',
    stabilityPoolDeployment.address,
  );

  const troveManagerDeployment = await deploy('TroveManager', {
    contract: 'MockTroveManager',
    from: deployer,
    log: true,
    args: [
      stabilityPoolDeployment.address,
      mockLiquityPriceFeedDeployment.address,
    ],
  });
  const troveManager = await ethers.getContractAt(
    'MockTroveManager',
    troveManagerDeployment.address,
  );

  const vaultDeployment = await get('Vault_Liquity');
  const vault = await ethers.getContractAt('Vault', vaultDeployment.address);

  // Trigger events needed for backend development

  await vault.connect(owner).updateInvested();

  await troveManager.liquidation(
    BigNumber.from('2000000000000000000000'),
    BigNumber.from('1166776963361491786'),
    BigNumber.from('5863200820912019'),
    BigNumber.from('200000000000000000000'),
  );

  // Move time forward 12 days
  await ethers.provider.send('evm_increaseTime', [1.037e6]);
  await ethers.provider.send('evm_mine', []);
  // await ethers.provider.send('evm_increaseBlocks', [50]);
  // await ethers.provider.send('hardhat_mine', [parseInt('50', 16), parseInt('1.037e6', 16)]);

  await liquityPriceFeed.setPrice(parseUnits('1750', 18));

  await troveManager.liquidation(
    BigNumber.from('2000000000000000000000'),
    BigNumber.from('1397404171184386761'),
    BigNumber.from('7022131513489380'),
    BigNumber.from('200000000000000000000'),
  );

  // Move time forward 12 days
  await ethers.provider.send('evm_increaseTime', [1.037e6]);
  await ethers.provider.send('evm_mine', []);

  await liquityPriceFeed.setPrice(parseUnits('1800', 18));

  await stabilityPool.withdrawFromSP(0);

  await troveManager.liquidation(
    BigNumber.from('2000000000000000000000'),
    BigNumber.from('1397404171184386761'),
    BigNumber.from('7022131513489380'),
    BigNumber.from('200000000000000000000'),
  );

  // Move time forward 12 days
  await ethers.provider.send('evm_increaseTime', [1.037e6]);
  await ethers.provider.send('evm_mine', []);

  await liquityPriceFeed.setPrice(parseUnits('1500', 18));

  await troveManager.liquidation(
    BigNumber.from('2000000000000000000000'),
    BigNumber.from('1397404171184386761'),
    BigNumber.from('7022131513489380'),
    BigNumber.from('200000000000000000000'),
  );
};

func.tags = ['liquity_fixture'];
func.dependencies = ['dev', 'fixtures', 'vault', 'strategy'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(['docker', 'hardhat'], env.deployments.getNetworkName());

export default func;
