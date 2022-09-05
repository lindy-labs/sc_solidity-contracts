import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { includes } from 'lodash';

const func = async function (env: HardhatRuntimeEnvironment) {
  const [_owner, _alice, _bob] = await ethers.getSigners();
  const { deployer } = await env.getNamedAccounts();
  const { deploy } = env.deployments;

  const troveManagerDeployment = await deploy('TroveManager', {
    contract: 'MockTroveManager',
    from: deployer,
    log: true,
    args: [],
  });
  const troveManager = await ethers.getContractAt('MockTroveManager', troveManagerDeployment.address);

  await troveManager.liquidation(
    BigNumber.from('2000000000000000000000'),
    BigNumber.from('1166776963361491786'),
    BigNumber.from('5863200820912019'),
    BigNumber.from('200000000000000000000')
  );

  // Move time forward 12 days 
  await ethers.provider.send('evm_increaseTime', [1.037e+6]);
  await ethers.provider.send('evm_mine', []);

  await troveManager.liquidation(
    BigNumber.from('2000000000000000000000'),
    BigNumber.from('1397404171184386761'),
    BigNumber.from('7022131513489380'),
    BigNumber.from('200000000000000000000')
  );
};

func.tags = ['liquity_fixture'];
func.dependencies = ['dev', 'fixtures', 'vault', 'strategy'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(['docker', 'hardhat'], env.deployments.getNetworkName());

export default func;
