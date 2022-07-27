import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { includes } from 'lodash';
import { ethers } from 'hardhat';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { get } = env.deployments;
  const [_owner, _alice, _bob, treasury] = await ethers.getSigners();

  const LUSD = await ethers.getContractAt(
    'MockERC20',
    (
      await get('LUSD')
    ).address,
  );

  const vaultDeployment = await get('Vault_LUSD');
  const vault = await ethers.getContractAt('Vault', vaultDeployment.address);

  const donationsDeployment = await get('Donations');
  const donations = await ethers.getContractAt(
    'Donations',
    donationsDeployment.address,
  );

  const yieldClaimedFilter = vault.filters.YieldClaimed(null, treasury.address);
  const yieldClaimedEvents = await vault.queryFilter(yieldClaimedFilter);

  let { transactionHash, args } = yieldClaimedEvents[0];

  await donations.mint(transactionHash, 0, [
    {
      destinationId: 9,
      owner: args.claimerId,
      token: LUSD.address,
      amount: args.amount,
      // donationId is is the id generated for the donation record by the
      // subgraph handler for YieldClaimed event
      donationId:
        '0x8945ff0b4e5a4ff57c0021a33bef8276cb41f422b0288b24a3933a6619f1d38b-1-0',
    },
    {
      destinationId: 10,
      owner: args.claimerId,
      token: LUSD.address,
      amount: args.amount,
      donationId:
        '0x8945ff0b4e5a4ff57c0021a33bef8276cb41f422b0288b24a3933a6619f1d38b-1-1',
    },
  ]);

  ({ transactionHash, args } = yieldClaimedEvents[1]);

  // Move time forward more than 180 days
  await ethers.provider.send('evm_increaseTime', [1.6e7]);
  await ethers.provider.send('evm_mine', []);

  await donations.burn(
    1,
    '0x8945ff0b4e5a4ff57c0021a33bef8276cb41f422b0288b24a3933a6619f1d38b-1-0',
  );
};

func.tags = ['donations_fixture'];
func.dependencies = ['dev', 'fixtures', 'vault', 'donations'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(['docker', 'hardhat'], env.deployments.getNetworkName());

export default func;
