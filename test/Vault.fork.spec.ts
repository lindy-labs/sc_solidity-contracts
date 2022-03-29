import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers} from "hardhat";
import { expect } from "chai";

import {
  Vault,
  Vault__factory,
  ERC20,
  ICurve,
  ICurve__factory,
  ERC20__factory,
} from "../typechain";
import { ForkHelpers } from "./shared";

const { formatUnits, parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

const FORK_BLOCK = 14449700;
const UST_ADDRESS = "0xa47c8bf37f92abed4a126bda807a7b7498661acd";
const USDT_ADDRESS = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const DAI_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
const CURVE_UST_3CRV_POOL = "0x890f4e345b1daed0367a877a1612f86a1f86985f";

const curveIndexes = {
  ust: 0,
  dai: 1,
  usdc: 2,
  usdt: 3,
};

describe("Vault (fork tests)", () => {
  let owner: SignerWithAddress;

  let ust: ERC20;
  let dai: ERC20;
  let usdc: ERC20;
  let usdt: ERC20;
  let curvePool: ICurve;
  let vault: Vault;

  let decimals: Record<string, number>;

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);
    [owner] = await ethers.getSigners();

    ust = ERC20__factory.connect(UST_ADDRESS, owner);
    dai = ERC20__factory.connect(DAI_ADDRESS, owner);
    usdc = ERC20__factory.connect(USDC_ADDRESS, owner);
    usdt = ERC20__factory.connect(USDT_ADDRESS, owner);
    curvePool = ICurve__factory.connect(CURVE_UST_3CRV_POOL, owner);

    decimals = {
      ust: await ust.decimals(),
      dai: await dai.decimals(),
      usdc: await usdc.decimals(),
      usdt: await usdt.decimals(),
    };

    vault= await new Vault__factory(owner).deploy(ust.address, 
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      owner.address,
      PERFORMANCE_FEE_PCT,
      []
    ]);

    await ForkHelpers.mintToken(ust, swapper, parseUnits("100"));
    await ForkHelpers.mintToken(dai, swapper, parseUnits("100"));
    await ForkHelpers.mintToken(usdc, swapper, parseUnits("100"));
    await ForkHelpers.mintToken(usdt, swapper, parseUnits("100"));
  });

  describe("addPool", function(){
    it("allows adding new valid pools",async()=>{

    })

  })

});
