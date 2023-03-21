import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import _ from 'lodash';
import { ethers } from 'hardhat';
import { YieldClaimedEvent } from '@root/typechain/IVault';
import {
  DonationMintedEvent,
  DonationBurnedEvent,
} from '@root/typechain/contracts/Donations';
import { VAULT_PREFIXES } from './97_fixtures';
import { parseUnits } from 'ethers/lib/utils';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { get } = env.deployments;
  const [_owner, _alice, _bob, treasury] = await ethers.getSigners();

  const LUSD = await ethers.getContractAt(
    'MockERC20',
    (
      await get('LUSD')
    ).address,
  );

  const donations = await ethers.getContractAt(
    'Donations',
    (
      await get('Donations')
    ).address,
  );

  let batchNr = 0;
  for (const prefix of VAULT_PREFIXES) {
    const vault = await ethers.getContractAt(
      'Vault',
      (
        await get(`${prefix}_Vault`)
      ).address,
    );

    const underlying = await ethers.getContractAt(
      'MockERC20',
      await vault.underlying(),
    );
    await underlying
      .connect(_owner)
      .mint(donations.address, parseUnits('5000', 18)); // fund

    const yieldClaimedEvents = treasuryYieldClaimedEvents(
      await vault.queryFilter(
        vault.filters.YieldClaimed(null, treasury.address),
      ),
      treasury.address,
    );

    // Mint donation NFTs
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
        vault: vault.address,
      },
      {
        destinationId: 10,
        owner: args.claimerId,
        token: LUSD.address,
        amount: args.amount,
        donationId: `${transactionHash}-0-1`,
        vault: vault.address,
      },
    ]);

    // Move time forward more than 180 days
    await ethers.provider.send('evm_increaseTime', [1.6e7]);
    await ethers.provider.send('evm_mine', []);

    await donations.burn(batchNr * 2 + 1, `${transactionHash}-0-0`);

    batchNr += 1;
  }

  // Prepare and execute donate transactions
  const donationMintedEvents: DonationMintedEvent[] =
    await donations.queryFilter(donations.filters.DonationMinted(null));
  const donationBurnedEvents: DonationBurnedEvent[] =
    await donations.queryFilter(donations.filters.DonationBurned(null));

  const uniqueObjects = {};
  const donateParamsArray = [];

  donationMintedEvents.forEach((mintedEvent: DonationMintedEvent) => {
    const donationId = mintedEvent.args.donationId;
    const correspondingBurnedEvent = donationBurnedEvents.find(
      (burnedEvent: DonationBurnedEvent) =>
        burnedEvent.args.donationId === donationId,
    );

    if (correspondingBurnedEvent) {
      const destinationId = mintedEvent.args.destinationId;
      const token = mintedEvent.args.token;

      if (!uniqueObjects[destinationId + token]) {
        uniqueObjects[destinationId + token] = { destinationId, token };
        donateParamsArray.push(uniqueObjects[destinationId + token]);
      }
    }
  });

  await Promise.all(
    donateParamsArray.map((donateParams) =>
      donations.donate(
        donateParams.destinationId,
        donateParams.token,
        _alice.address,
      ),
    ),
  );
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
  !_.includes(['docker', 'hardhat'], env.deployments.getNetworkName());

export default func;
