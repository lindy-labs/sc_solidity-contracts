import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { ethers, getChainId } from "hardhat";
import { Vault__factory } from "../typechain";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const {
    deployments: { deploy, get },
    getNamedAccounts,
  } = env;

  const chainId = await getChainId();
  if (chainId === "1") {
    // Deploy on mainnet
  } else if (chainId === "3") {
    // Deploy on ropsten testnet

    const {
      deployer,
      daiToken,
      ustToken,
      aUstToken,
      owner,
      treasury,
      ethAnchorRouter,
      aUstToUstFeed,
      exchangeRateFeeder,
      uniV2Router,
    } = await getNamedAccounts();
    const minLockPeriod = 0; // for test

    const investPct = 9000;

    const perfFeePct = 300; // 3%

    await deploy("DAIVault", {
      contract: "Vault",
      from: deployer,
      args: [daiToken, minLockPeriod, investPct, owner],
      log: true,
    });

    const VaultFactory = (await ethers.getContractFactory(
      "Vault"
    )) as Vault__factory;

    const vault = VaultFactory.attach((await get("DAIVault")).address);

    await deploy("DAIStrategy", {
      contract: "TestNonUSTAnchorStrategy",
      from: deployer,
      args: [
        vault.address,
        treasury,
        ethAnchorRouter,
        aUstToUstFeed,
        exchangeRateFeeder,
        ustToken,
        aUstToken,
        perfFeePct,
        owner,
        uniV2Router,
      ],
      log: true,
    });

    await vault.setStrategy((await get("DAIStrategy")).address);
  } else {
    throw Error("Not supported network");
  }
};

func.tags = ["DaiVault"];

export default func;
