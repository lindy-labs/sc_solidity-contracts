import type { HardhatRuntimeEnvironment } from 'hardhat/types';

import { includes } from 'lodash';
import { ethers } from 'hardhat';
import { utils } from 'ethers';
import { getCurrentNetworkConfig } from '../scripts/deployConfigs';

import liquityMocks from './helpers/liquityMocks';

const func = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { get, deploy, getNetworkName } = env.deployments;
  const { multisig } = await getCurrentNetworkConfig();
  const [owner] = await ethers.getSigners();

  const vaultAddress = (await get('Liquity_DCA_Vault')).address;
  const vault = await ethers.getContractAt('Vault', vaultAddress);

  const LUSDDeployment = await get('LUSD');

  let address0x: string;

  let liquityStrategyContract = includes(
    ['hardhat', 'docker'],
    getNetworkName(),
  )
    ? 'MockLiquityStrategyV3'
    : 'LiquityDCAStrategy';

  const liquityStrategyDeployment = await deploy('Liquity_DCA_Strategy', {
    contract: liquityStrategyContract,
    from: deployer,
    args: [],
    log: true,
  });

  let curveRouter = '0x81C46fECa27B31F3ADC2b91eE4be9717d1cd3DD7';

  const liquityStrategy = await ethers.getContractAt(
    'LiquityStrategy',
    liquityStrategyDeployment.address,
  );

  if (getNetworkName() !== 'hardhat' && getNetworkName() !== 'docker') {
    await env
      .run('verify:verify', {
        address: liquityStrategy.address,
        constructorArguments: [],
      })
      .catch((e) => console.error((e as Error).message));

    await env.tenderly.persistArtifacts({
      name: 'Liquity_DCA_Strategy',
      address: liquityStrategy.address,
    });
  }

  if (getNetworkName() !== 'mainnet') {
    const res = await liquityMocks(env, 'Liquity_DCA');
    address0x = res.mock0x.address;
  }

  const stabilityPool = await get('Liquity_DCA_Stability_Pool');
  const LQTYDeployment = await get('LQTY');

  try {
    // initialize strategy
    const tx = await liquityStrategy.initialize(
      vault.address,
      owner.address,
      stabilityPool.address,
      LQTYDeployment.address,
      LUSDDeployment.address,
      multisig,
      0,
      curveRouter,
    );

    await tx.wait();
    console.log('LquityStrategy initialized');
  } catch (e) {
    console.log('Liquity_DCA_Strategy already initialized');
  }

  // set manager role
  await liquityStrategy
    .connect(owner)
    .grantRole(
      utils.keccak256(utils.toUtf8Bytes('MANAGER_ROLE')),
      owner.address,
    );

  console.log('manager_role granted to owner for strategy');

  await vault.connect(owner).setStrategy(liquityStrategy.address);
  console.log('strategy set to vault');

  // get 0x contract

  if (!address0x) address0x = '0xdef1c0ded9bec7f1a1670819833240f027b25eff';

  await liquityStrategy.connect(owner).allowSwapTarget(address0x);

  if (owner.address !== multisig) {
    await (await vault.connect(owner).transferAdminRights(multisig)).wait();
    console.log('vault ownership transfered to multisig');

    await (
      await liquityStrategy.connect(owner).transferAdminRights(multisig)
    ).wait();
    console.log('strategy ownership transfered to multisig');
  }
};

func.tags = ['liquity_dca_strategy'];
func.dependencies = ['liquity_dca_vault'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(
    ['ropsten', 'docker', 'mainnet', 'hardhat', 'goerli'],
    env.deployments.getNetworkName(),
  );

export default func;
