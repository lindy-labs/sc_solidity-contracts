import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ethers } from 'hardhat';

const func = async function (env: HardhatRuntimeEnvironment) {
  // const { ethAnchorOperator, ethAnchorOperator1 } =
  //   await env.getNamedAccounts();
  const { get } = env.deployments;
  const [owner, alice, bob, treasury] = await ethers.getSigners();

  const USTDeployment = await get('MockUST');
  const UST = await ethers.getContractAt('MockERC20', USTDeployment.address);

  const vaultDeployment = await get('Vault_UST');
  const vault = await ethers.getContractAt(
    'Vault',
    vaultDeployment.address,
  );

  const donationsDeployment = await get('Donations');
  const donations = await ethers.getContractAt(
    'Donations',
    donationsDeployment.address,
  );

  console.log('treasury address', treasury.address);

  const yieldClaimedFilter = vault.filters.YieldClaimed(null, treasury.address);

  const yieldClaimedEvents = await vault.queryFilter(yieldClaimedFilter);

  console.log('yieldClaimedEvents', yieldClaimedEvents);

  const { transactionHash, args } = yieldClaimedEvents[0];

  const donationParams = {
    destinationId: 9,
    owner: args.claimerId,
    token: UST.address,
    amount: args.amount,
    donationId: '0',
  };

  await (await donations.mint(transactionHash, 0, [donationParams])).wait();

  process.exit(1);
};

func.id = 'donations_fixture';
func.tags = ['donations_fixture'];
func.dependencies = ['donations', 'vaults', 'fixtures', 'fixture_deployments'];

// Deploy only to hardhat
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337;

export default func;
