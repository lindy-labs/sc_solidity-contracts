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
      ustToken,
      aUstToken,
      owner,
      treasury,
      ethAnchorRouter,
      aUstToUstFeed,
      exchangeRateFeeder,
    } = await getNamedAccounts();
    const minLockPeriod = 0; // for test

    const investPct = 9000;

    const perfFeePct = 300; // 3%

    await deploy("USTVault", {
      contract: "Vault",
      from: deployer,
      args: [ustToken, minLockPeriod, investPct, owner],
      log: true,
    });

    const VaultFactory = (await ethers.getContractFactory(
      "Vault"
    )) as Vault__factory;

    const vault = VaultFactory.attach((await get("USTVault")).address);

    await deploy("USTStrategy", {
      contract: "TestUSTAnchorStrategy",
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
      ],
      log: true,
    });

    await vault.setStrategy((await get("USTStrategy")).address);
  } else {
    throw Error("Not supported network");
  }
};

func.tags = ["UstVault"];

export default func;
