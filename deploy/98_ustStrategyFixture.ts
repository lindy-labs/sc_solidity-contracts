import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ethers } from 'hardhat';

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  const { ethAnchorOperator, ethAnchorOperator1 } =
    await env.getNamedAccounts();
  const { get } = env.deployments;
  const [owner, alice, bob, treasury] = await ethers.getSigners();

  const mockUST = await get('MockUST');
  const underlying = await ethers.getContractAt('MockERC20', mockUST.address);

  const mockaUSTDeployment = await get('aUST');
  const mockaUST = await ethers.getContractAt(
    'MockERC20',
    mockaUSTDeployment.address,
  );

  const vaultDeployment = await get('Vault_UST');
  const vault = await ethers.getContractAt('Vault', vaultDeployment.address);
  const mockEthAnchorRouterDeployment = await get('MockEthAnchorRouter');
  const mockChainlinkPriceFeedDeployment = await get('MockChainlinkPriceFeed');
  const mockChainlinkPriceFeed = await ethers.getContractAt(
    'MockChainlinkPriceFeed',
    mockChainlinkPriceFeedDeployment.address,
  );

  const mockEthAnchorRouter = await ethers.getContractAt(
    'MockEthAnchorRouter',
    mockEthAnchorRouterDeployment.address,
  );

  const anchorStrategyDeployment = await get('AnchorStrategy');
  const anchorStrategy = await ethers.getContractAt(
    'AnchorStrategy',
    anchorStrategyDeployment.address,
  );

  await underlying.mint(bob.address, parseUnits('5000', 18));
  await mockaUST.mint(owner.address, parseUnits('5000', 18));

  await Promise.all(
    [alice, bob, treasury, owner].map((account) =>
      underlying
        .connect(account)
        .approve(vault.address, parseUnits('5000', 18)),
    ),
  );

  await mockaUST
    .connect(owner)
    .approve(mockEthAnchorRouter.address, parseUnits('5000', 18));

  await setChainlinkData(1);

  await mockEthAnchorRouter.addPendingOperator(ethAnchorOperator);
  const updateInvestedTx = await vault.connect(owner).updateInvested();
  await updateInvestedTx.wait();

  await mockEthAnchorRouter.notifyDepositResult(
    ethAnchorOperator,
    parseUnits('2812', 18)
  );

  await anchorStrategy.finishDepositStable('0');

  await setChainlinkData(2);

  await vault.connect(bob).deposit({
    amount: parseUnits('1500', 18),
    lockDuration: 1,
    claims: [
      {
        beneficiary: bob.address,
        pct: 10000,
        data: '0x',
      },
    ],
    inputToken: mockUST.address,
    name: "Bob's Foundation - 2",
  });

  await mockEthAnchorRouter.addPendingOperator(ethAnchorOperator1);
  await (await vault.connect(owner).updateInvested()).wait();

  await mockEthAnchorRouter.notifyDepositResult(
    ethAnchorOperator1,
    parseUnits('1500', 18),
  );

  async function setChainlinkData(round: number) {
    await mockChainlinkPriceFeed.setLatestRoundData(
      round,
      ethers.utils.parseEther('1'),
      0,
      round,
      round,
    );
  }
};

func.id = 'dev_strategies';
func.tags = ['dev_strategies'];
func.dependencies = ['vaults', 'fixtures', 'fixture_deployments'];

// Deploy only to hardhat
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.config.chainId != 31337;

export default func;
