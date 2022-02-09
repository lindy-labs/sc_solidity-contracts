import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction, Deployment } from "hardhat-deploy/types";

import { ethers } from "hardhat";
import { logContract, deployViaFactory } from "../scripts/deployHelpers";

async function deployDCA(
  env: HardhatRuntimeEnvironment,
  name: string,
  vault: Deployment,
  token: Deployment,
  path: string,
  period: number
) {
  const { deployer } = await env.getNamedAccounts();

  const DCAUniswapV3 = await ethers.getContractFactory("DCAUniswapV3");

  const { address } = await deployViaFactory(
    env,
    "deployDCA",
    name,
    DCAUniswapV3,
    [vault.address, token.address, path, period, deployer]
  );

  logContract(name, address);
}

const func: DeployFunction = async function (env) {
  const { get } = env.deployments;

  const usdc = await get("USDC");
  const dai = await get("DAI");
  const weth = await get("WETH");
  const wbtc = await get("WBTC");
  const vault_usdc = await get("Vault_USDC");
  const vault_dai = await get("Vault_DAI");

  const period = 60 * 60 * 24 * 30;

  await deployDCA(
    env,
    "Vault_USDC_DCA_WETH",
    vault_usdc,
    weth,
    ethers.utils.solidityPack(
      ["address", "uint24", "address"],
      [usdc.address, 3000, weth.address]
    ),
    period
  );

  await deployDCA(
    env,
    "Vault_USDC_DCA_WBTC",
    vault_usdc,
    wbtc,
    ethers.utils.solidityPack(
      ["address", "uint24", "address"],
      [usdc.address, 3000, wbtc.address]
    ),
    period
  );

  await deployDCA(
    env,
    "Vault_DAI_DCA_WETH",
    vault_dai,
    weth,
    ethers.utils.solidityPack(
      ["address", "uint24", "address", "uint24", "address"],
      [dai.address, 500, usdc.address, 3000, weth.address]
    ),
    period
  );

  await deployDCA(
    env,
    "Vault_DAI_DCA_WBTC",
    vault_dai,
    wbtc,
    ethers.utils.solidityPack(
      ["address", "uint24", "address", "uint24", "address"],
      [dai.address, 500, usdc.address, 3000, wbtc.address]
    ),
    period
  );
};

func.id = "deploy_dcas";
func.tags = ["DCAs"];

// run this only on live networks
// TODO in order to deploy these on test networks, we need to mock uniswap pools
func.skip = (env: HardhatRuntimeEnvironment) =>
  Promise.resolve(env.network.live);

export default func;
