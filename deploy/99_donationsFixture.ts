import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { includes } from 'lodash';
import { ethers } from 'hardhat';
import { YieldClaimedEvent } from '@root/typechain/IVault';
import { VAULT_PREFIXES } from './97_fixtures';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { get } = env.deployments;
  const [_owner, _alice, _bob, treasury] = await ethers.getSigners();

  const LUSD = await ethers.getContractAt(
    'MockERC20',
    (
      await get('LUSD')
    ).address,
  );

  let batchNr = 0;
  for (const prefix of VAULT_PREFIXES) {
    const vaultDeployment = await get(`${prefix}_Vault`);
    const vault = await ethers.getContractAt('Vault', vaultDeployment.address);

    const donationsDeployment = await get('Donations');
    const donations = await ethers.getContractAt(
      'Donations',
      donationsDeployment.address,
    );

    const yieldClaimedFilter = vault.filters.YieldClaimed(
      null,
      treasury.address,
    );
    const yieldClaimedEvents = treasuryYieldClaimedEvents(
      await vault.queryFilter(yieldClaimedFilter),
      treasury.address,
    );

    let { transactionHash, args } = yieldClaimedEvents[0];

    await donations.mint(transactionHash, batchNr, [
      {
        destinationId: 9,
        owner: args.claimerId,
        token: LUSD.address,
        amount: args.amount,
        // donationId is is the id generated for the donation record by the
        // subgraph handler for YieldClaimed event
        donationId: `${transactionHash}-0-0`,
      },
      {
        destinationId: 10,
        owner: args.claimerId,
        token: LUSD.address,
        amount: args.amount,
        donationId: `${transactionHash}-0-1`,
      },
    ]);

    // Move time forward more than 180 days
    await ethers.provider.send('evm_increaseTime', [1.6e7]);
    await ethers.provider.send('evm_mine', []);

    await donations.burn(batchNr * 2 + 1, `${transactionHash}-0-0`);

    batchNr += 1;
  }
};

function treasuryYieldClaimedEvents(
  yieldClaimedEvents: YieldClaimedEvent[],
  treasury: string,
) {
  return yieldClaimedEvents.filter(
    (event) => event.args.claimerId === treasury,
  );
}

func.tags = ['donations_fixture'];
func.dependencies = ['dev', 'fixtures', 'vault', 'donations'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(['docker', 'hardhat'], env.deployments.getNetworkName());

export default func;
