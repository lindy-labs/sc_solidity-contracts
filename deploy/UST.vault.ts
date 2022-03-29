import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getCurrentNetworkConfig } from "../scripts/deployConfigs";

const func: DeployFunction = async function (env: HardhatRuntimeEnvironment) {
  const { deployer } = await env.getNamedAccounts();
  const { deploy, get } = env.deployments;

  const ust = await get("UST");
  const dai = await get("DAI");
  const usdc = await get("USDC");
  const usdt = await get("USDT");
  const curvePool = await get("CurvePool-UST-3CRV");

  const { minLockPeriod, investPct, perfFeePct, multisig } =
    await getCurrentNetworkConfig();
  const treasury = multisig;
  const owner = multisig;

  await deploy("Vault_UST", {
    contract: "Vault",
    from: deployer,
    log: true,
    args: [
      ust.address,
      minLockPeriod,
      investPct,
      treasury,
      owner,
      perfFeePct,
      [
        {
          token: dai.address,
          pool: curvePool.address,
          tokenI: 1,
          underlyingI: 0,
        },
        {
          token: usdc.address,
          pool: curvePool.address,
          tokenI: 2,
          underlyingI: 0,
        },
        {
          token: usdt.address,
          pool: curvePool.address,
          tokenI: 3,
          underlyingI: 0,
        },
      ],
    ],
  });
};

func.id = "deploy_ust_vault";
func.tags = ["vaults", "ust"];
func.dependencies = ["dev_setup"];

export default func;
