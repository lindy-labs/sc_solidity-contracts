import type { HardhatRuntimeEnvironment } from 'hardhat/types';
import type { DeployFunction } from 'hardhat-deploy/types';

import { includes } from 'lodash';
import { parseUnits } from '@ethersproject/units';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { get } = env.deployments;

  const [owner, alice, bob, treasury] = await ethers.getSigners();

  console.table([alice, bob, treasury]);

  const lusd = await get('LUSD');
  const vaults = {
    yearn: await get('Yearn_LUSD_Vault'),
    liquity: await get('Liquity_Amethyst_Vault'),
  };

  for (const vaultKey in vaults) {
    const underlying = await ethers.getContractAt('MockERC20', lusd.address);

    const vaultAddress = vaults[vaultKey].address;
    console.log('vaultAddress', vaultAddress);
    const vault = await ethers.getContractAt('Vault', vaultAddress);

    console.log('Configuring vault strategy, treasury and investPct');
    await vault.connect(owner).setTreasury(treasury.address);
    await vault.connect(owner).setInvestPct('8000');

    await underlying.mint(alice.address, parseUnits('5000', 18));
    await underlying.mint(bob.address, parseUnits('5000', 18));

    await Promise.all(
      [alice, bob, treasury].map((account) =>
        underlying
          .connect(account)
          .approve(vault.address, parseUnits('5000', 18)),
      ),
    );

    console.log('The treasury sponsors 1000');
    await vault.grantRole(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes('SPONSOR_ROLE')),
      treasury.address,
    );
    const lockDuration = await vault.MIN_SPONSOR_LOCK_DURATION();
    await vault
      .connect(treasury)
      .sponsor(
        lusd.address,
        parseUnits('1000', 18),
        lockDuration,
        BigNumber.from(5),
      );

    console.log(
      'Alice deposits 1000 with 90% yield to Alice and 10% yield for donations',
    );
    await vault.connect(alice).deposit({
      amount: parseUnits('1000', 18),
      inputToken: lusd.address,
      lockDuration: 1,
      claims: [
        {
          beneficiary: alice.address,
          pct: 9000,
          data: '0x',
        },
        {
          beneficiary: treasury.address,
          pct: 1000,
          data: ethers.utils.hexlify(123124),
        },
      ],
      name: "Alice's Foundation 1",
      amountOutMin: parseUnits('990', 18),
    });

    console.log(
      'Bob deposits 1000 with 50% yield to Alice and 50% yield for donations',
    );
    await vault.connect(bob).deposit({
      amount: parseUnits('1000', 18),
      inputToken: lusd.address,
      lockDuration: 1,
      claims: [
        {
          beneficiary: bob.address,
          pct: 5000,
          data: '0x',
        },
        {
          beneficiary: treasury.address,
          pct: 5000,
          data: ethers.utils.hexlify(123123),
        },
      ],
      name: "Bob's Foundation 1",
      amountOutMin: parseUnits('990', 18),
    });

    console.log('2000 yield is generated');
    await underlying.mint(vault.address, parseUnits('2000', 18));

    console.log('Alice claims');
    await vault.connect(alice).claimYield(alice.address);

    console.log('The treasury claims');
    await vault.connect(treasury).claimYield(treasury.address);

    console.log('Bob claims to treasury');
    await vault.connect(bob).claimYield(treasury.address);
  }
};

func.tags = ['fixtures'];
func.dependencies = ['dev', 'vault'];

func.skip = async (env: HardhatRuntimeEnvironment) =>
  !includes(['docker', 'hardhat'], env.deployments.getNetworkName());

export default func;
