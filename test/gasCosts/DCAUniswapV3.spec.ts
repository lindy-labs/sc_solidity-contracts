import chai from "chai";
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";

import type { Contract } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { ERC20, TestDCAUniswapV3, MockVault } from "../../typechain";
import { ContractFactory, BigNumber } from "ethers";

import { ForkHelpers, increaseTime } from "../shared";
import { depositParams, claimParams } from "../shared/factories";

chai.use(solidity);

const { parseUnits, formatUnits } = ethers.utils;

describe("DCAUniswapV3", () => {
  const USDC_CONTRACT = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const DAI_CONTRACT = "0x6b175474e89094c44da98b954eedeac495271d0f";
  const WETH_CONTRACT = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const MAX_MONTHS = 6;

  let TestDCAUniswapV3: ContractFactory;
  let MockVault: ContractFactory;

  let alice: SignerWithAddress;

  let usdc: ERC20;
  let dai: ERC20;
  let weth: ERC20;

  let usdcDCA: TestDCAUniswapV3;
  let daiDCA: TestDCAUniswapV3;
  let usdcVault: MockVault;
  let daiVault: MockVault;
  const period = 30 * 24 * 60 * 60; // 30 days

  let versions: Record<
    string,
    {
      token: ERC20;
      dca: TestDCAUniswapV3;
      vault: MockVault;
      principal: BigNumber;
      yld: BigNumber;
    }
  >;

  const gasPrice = parseUnits("100", "gwei");

  before(async () => {
    await ForkHelpers.forkToMainnet(13778740);

    usdc = (await ethers.getContractAt("ERC20", USDC_CONTRACT)) as ERC20;
    weth = (await ethers.getContractAt("ERC20", WETH_CONTRACT)) as ERC20;
    dai = (await ethers.getContractAt("ERC20", DAI_CONTRACT)) as ERC20;

    TestDCAUniswapV3 = await ethers.getContractFactory("TestDCAUniswapV3");
    MockVault = await ethers.getContractFactory("MockVault");
  });

  after(async () => {
    await ForkHelpers.unfork();
  });

  beforeEach(async () => {
    [alice] = await ethers.getSigners();

    usdcVault = (await MockVault.deploy(usdc.address)) as MockVault;
    daiVault = (await MockVault.deploy(dai.address)) as MockVault;
    usdcDCA = (await TestDCAUniswapV3.deploy(
      usdcVault.address,
      weth.address,
      ethers.utils.solidityPack(
        ["address", "uint24", "address"],
        [usdc.address, 3000, weth.address]
      ),
      period
    )) as TestDCAUniswapV3;
    daiDCA = (await TestDCAUniswapV3.deploy(
      daiVault.address,
      weth.address,
      ethers.utils.solidityPack(
        ["address", "uint24", "address", "uint24", "address"],
        [dai.address, 500, usdc.address, 3000, weth.address]
      ),
      period
    )) as TestDCAUniswapV3;

    await usdc
      .connect(alice)
      .approve(usdcVault.address, parseUnits("1000000000", 6));
    await dai
      .connect(alice)
      .approve(daiVault.address, parseUnits("1000000000", 18));

    await ForkHelpers.setTokenBalance(usdc, alice, parseUnits("10000", 6));
    await ForkHelpers.setTokenBalance(dai, alice, parseUnits("10000"));

    versions = {
      usdc: {
        token: usdc,
        vault: usdcVault,
        dca: usdcDCA,
        principal: parseUnits("1000", 6),
        yld: parseUnits("1000", 6),
      },
      dai: {
        token: dai,
        vault: daiVault,
        dca: daiDCA,
        principal: parseUnits("1000", 18),
        yld: parseUnits("1000", 18),
      },
    };
  });

  const reports = {};

  ["usdc", "dai"].map((currency) => {
    [false, true].map((updatePosition) => {
      Array(MAX_MONTHS)
        .fill(0)
        .map((_, i) => {
          const report = `Gas estimations for ${currency.toUpperCase()}->WETH - ${
            updatePosition
              ? "with monthly shares updates"
              : "with static shares"
          }`;

          xit(report, async () => {
            const { token, dca, vault, yld, principal } = versions[currency];
            const months = i + 1;

            await vault
              .connect(alice)
              .deposit(depositWithDCAClaim(dca, principal, alice.address));

            let gasUsedForSwaps = BigNumber.from(0);
            let gasUsedToWithdraw = BigNumber.from(0);

            for (let month = 1; month <= months; month++) {
              await increaseTime(period);

              // mint this month's yield
              await ForkHelpers.mintToken(token, vault, yld);

              const tx = await dca.executeSwap(0, 2536431400);
              const receipt = await tx.wait();

              gasUsedForSwaps = gasUsedForSwaps.add(receipt.gasUsed);

              if (updatePosition) {
                // trigger a new position
                await vault
                  .connect(alice)
                  .deposit(depositWithDCAClaim(dca, principal, alice.address));
              }
            }

            const tx = await dca.connect(alice).withdraw();
            const receipt = await tx.wait();

            gasUsedToWithdraw = receipt.gasUsed;

            const report = `Gas estimations for ${currency.toUpperCase()}->WETH - ${
              updatePosition
                ? "with monthly shares updates"
                : "with static shares"
            }`;
            reports[report] ||= [];
            reports[report].push({
              "duration (months)": i + 1,
              "total swaps": toGasCost(gasUsedForSwaps),
              "average per swap": toGasCost(gasUsedForSwaps.div(i + 1)),
              withdraw: toGasCost(gasUsedToWithdraw),
            });
          });
        });
    });
  });

  function toGasCost(gas: BigNumber): string {
    return formatUnits(gas.mul(gasPrice));
  }

  after(async () => {
    Object.keys(reports).map((report) => {
      console.log(report);
      console.table(reports[report]);
    });
  });

  function depositWithDCAClaim(
    dca: Contract,
    amount: BigNumber | number,
    beneficiary: string
  ): any {
    return depositParams.build({
      amount,
      claims: [
        claimParams.percent(100).to(dca.address).build({ data: beneficiary }),
      ],
    });
  }
});
