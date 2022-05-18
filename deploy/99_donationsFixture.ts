import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ethers } from 'hardhat';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { get } = env.deployments;
  const [_owner, _alice, _bob, treasury] = await ethers.getSigners();

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

  let { transactionHash, args } = yieldClaimedEvents[0];

  await donations.mint(transactionHash, 0, [
    {
      // destinationId: 123123,
      destinationId: 9,
      owner: args.claimerId,
      token: UST.address,
      amount: args.amount,
      // donationId is is the id generated for the donation record by the
      // subgraph handler for YieldClaimed event
      donationId:
        '0xc21191fcea1d9acbfbe513a5ca5993c82500a4be541f419d191c1017ed374d66-1-0',
    },
  ]);

  ({ transactionHash, args } = yieldClaimedEvents[1]);

  await donations.mint(transactionHash, 1, [
    {
      destinationId: 123124,
      owner: args.claimerId,
      token: UST.address,
      amount: args.amount,
      donationId:
        '0xd8dadc8103a13e59d2d1d10402d25cc0f8953217037f1f46b0d6700b514344aa-1-0',
    },
  ]);
};

func.id = 'donations_fixture';
func.tags = ['donations_fixture'];
func.dependencies = [
  'fixture_deployments',
  'fixtures',
  'strategies',
  'donations',
];

// Deploy only to hardhat
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337;

export default func;
