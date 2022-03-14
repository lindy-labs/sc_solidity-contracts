import type { HardhatRuntimeEnvironment } from "hardhat/types";

import { network, ethers } from "hardhat";

import { isRopstenFork } from "../scripts/deployConfigs";

const { parseUnits } = ethers.utils;

const func = async function (env: HardhatRuntimeEnvironment) {
  const { save } = env.deployments;

  await save("DAI", {
    address: "0x6bb59e3f447222b3fcf2847111700723153f625a",
    abi: [],
  });
  await save("USDC", {
    address: "0xE015FD30cCe08Bc10344D934bdb2292B1eC4BBBD",
    abi: [],
  });
  await save("UST", {
    address: "0x6cA13a4ab78dd7D657226b155873A04DB929A3A4",
    abi: [],
  });
  await save("aUST", {
    address: "0x006479f75D6622AE6a21BE17C7F555B94c672342",
    abi: [],
  });
};

func.id = "dev_setup";
func.tags = ["dev_setup"];
func.skip = async () => !(await isRopstenFork());

export default func;
