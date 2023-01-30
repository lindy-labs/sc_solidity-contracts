import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { includes } from 'lodash';
import { parseEther, parseUnits } from 'ethers/lib/utils';

const func = async function (env: HardhatRuntimeEnvironment) {
  const [owner, _alice, _bob] = await ethers.getSigners();
  const { get } = env.deployments;

  // Deploy and gather needed mock contracts

  const liquityPriceFeedDeployment = await get('LiquityPriceFeed');
  const liquityPriceFeed = await ethers.getContractAt(
    'MockLiquityPriceFeed',
    liquityPriceFeedDeployment.address,
  );

  await liquityPriceFeed.setPrice(parseUnits('1700', 18));

  const stabilityPoolDeployment = await get('LiquityStabilityPool');
  const stabilityPool = await ethers.getContractAt(
    'MockStabilityPool',
    stabilityPoolDeployment.address,
  );

  const troveManagerDeployment = await get('TroveManager');
  const troveManager = await ethers.getContractAt(
    'MockTroveManager',
    troveManagerDeployment.address,
  );

  const vaultDeployment = await get('Vault_Liquity');
  const vault = await ethers.getContractAt('Vault', vaultDeployment.address);

  const liquityStrategy = await ethers.getContractAt(
    'LiquityStrategy',
    await vault.strategy(),
  );

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
  // ideal way of advancing block but cannot be done because graph interprets
  // the blocks as being uncled which prevents sync
  // await ethers.provider.send("hardhat_mine", ["0x32"]);
  await mineNBlocks(75);

  await liquityPriceFeed.setPrice(parseUnits('1750', 18));

  await owner.sendTransaction({
    to: stabilityPool.address,
    value: parseEther('0.1'),
  });

  await troveManager.liquidation(
    BigNumber.from('2000000000000000000000'),
    BigNumber.from('1397404171184386761'),
    BigNumber.from('7022131513489380'),
    BigNumber.from('200000000000000000000'),
  );

  await liquityPriceFeed.setPrice(parseUnits('1800', 18));

  await liquityStrategy.harvest();

  // Move time forward 12 days
  await ethers.provider.send('evm_increaseTime', [1.037e6]);
  // await ethers.provider.send('evm_mine', []);
  await mineNBlocks(75);

  await troveManager.liquidation(
    BigNumber.from('2000000000000000000000'),
    BigNumber.from('1397404171184386761'),
    BigNumber.from('7022131513489380'),
    BigNumber.from('200000000000000000000'),
  );

  await owner.sendTransaction({
    to: stabilityPool.address,
    value: parseEther('0.8'),
  });

  // Move time forward 12 days
  await ethers.provider.send('evm_increaseTime', [1.037e6]);
  await mineNBlocks(75);

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

async function mineNBlocks(n: number) {
  for (let index = 0; index < n; index++) {
    await ethers.provider.send('evm_mine', []);
  }
}

export default func;
