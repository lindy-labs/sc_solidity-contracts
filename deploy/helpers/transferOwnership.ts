import { Contract } from 'ethers';
import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { getCurrentNetworkConfig } from '../../scripts/deployConfigs';

async function transferOwnershipToMultisig(contract: Contract) {
  const [owner] = await ethers.getSigners();
  const { multisig } = await getCurrentNetworkConfig();

  if (owner.address === multisig) return;

  console.log('Transferring contract ownership to multisig');
  await (await contract.connect(owner).transferAdminRights(multisig)).wait();
}

transferOwnershipToMultisig.skip = async (hre: HardhatRuntimeEnvironment) =>
  true;

export default transferOwnershipToMultisig;
