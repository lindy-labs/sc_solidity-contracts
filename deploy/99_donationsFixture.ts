import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ethers } from 'hardhat';

const func = async function (env: HardhatRuntimeEnvironment) {
  // const { ethAnchorOperator, ethAnchorOperator1 } =
  //   await env.getNamedAccounts();
  const { get } = env.deployments;
  const [owner, alice, bob, treasury] = await ethers.getSigners();

  const USTDeployment = await get('UST');
  const UST = await ethers.getContractAt('MockERC20', USTDeployment.address);

  const vaultDeployment = await get('Vault_UST');
  const vault = await ethers.getContractAt('Vault', vaultDeployment.address);

  const donationsDeployment = await get('Donations');
  const donations = await ethers.getContractAt(
    'Donations',
    donationsDeployment.address,
  );

  const yieldClaimedFilter = vault.filters.YieldClaimed(null, treasury.address);
  const yieldClaimedEvents = await vault.queryFilter(yieldClaimedFilter);

  const { transactionHash, args } = yieldClaimedEvents[0];

  const donationParams = {
    destinationId: 9,
    owner: args.claimerId,
    token: UST.address,
    amount: args.amount,
    // donationId is is the id generated for the donation record by the
    // subgraph handler for YieldClaimed event
    donationId:
      '0xc21191fcea1d9acbfbe513a5ca5993c82500a4be541f419d191c1017ed374d66-1-0',
  };

  await donations.mint(transactionHash, 0, [donationParams]);

  // const donationMintedFilter = donations.filters.DonationMinted();
  // const donationMintedEvents = await donations.queryFilter(donationMintedFilter);

  // console.log('donationMintedEvents', donationMintedEvents);
};

func.id = 'donations_fixture';
func.tags = ['donations_fixture'];
func.dependencies = [
  'dev_setup',
  'donations',
  'vaults',
  'fixtures',
  'fixture_deployments',
];

// Deploy only to hardhat
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337;

export default func;
