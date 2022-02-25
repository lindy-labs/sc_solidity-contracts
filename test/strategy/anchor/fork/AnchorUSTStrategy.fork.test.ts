import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { time } from "@openzeppelin/test-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, utils, constants } from "ethers";
import {
  Vault,
  AnchorUSTStrategy,
  MockERC20,
  MockChainlinkPriceFeed,
  MockERC20__factory,
  MockChainlinkPriceFeed__factory,
} from "../../../../typechain";
import { generateNewAddress, ForkHelpers } from "../../../shared";
import config from "./config.json";

describe("AnchorUSTStrategy Mainnet fork", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let vault: Vault;
  let strategy: AnchorUSTStrategy;
  let ustToken: MockERC20;
  let aUstToken: MockERC20;
  // MockChainlinkPriceFeed has same interface as Mainnet, so we can use it for test
  let mockAUstUstFeed: MockChainlinkPriceFeed;
  const TWO_WEEKS = time.duration.days(14).toNumber();
  const INVEST_PCT = 10000; // set 100% for test
  const TREASURY = generateNewAddress();
  const FEE_PCT = BigNumber.from("200");
  const DENOMINATOR = BigNumber.from("10000");
  const FORK_BLOCK = 14023000;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes("MANAGER_ROLE"));

  before(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);
    [owner, alice, bob] = await ethers.getSigners();

    ustToken = new MockERC20__factory(owner).attach(config.ust);
    aUstToken = new MockERC20__factory(owner).attach(config.aUst);

    await ForkHelpers.mintToken(
      ustToken,
      alice,
      utils.parseEther("100000000000")
    );
    await ForkHelpers.mintToken(
      ustToken,
      bob,
      utils.parseEther("100000000000")
    );
  });

  describe("Use Mainnet aUST / UST Chainlink feed", () => {
    before(async () => {
      mockAUstUstFeed = new MockChainlinkPriceFeed__factory(owner).attach(
        config.aUstUstFeed
      );

      const VaultFactory = await ethers.getContractFactory("Vault");
      vault = await VaultFactory.deploy(
        ustToken.address,
        TWO_WEEKS,
        INVEST_PCT,
        owner.address
      );

      const AnchorUSTStrategyFactory = await ethers.getContractFactory(
        "AnchorUSTStrategy"
      );

      strategy = await AnchorUSTStrategyFactory.deploy(
        vault.address,
        TREASURY,
        config.ethAnchorRouter,
        config.aUstUstFeed,
        ustToken.address,
        aUstToken.address,
        FEE_PCT,
        owner.address
      );

      await strategy.connect(owner).grantRole(MANAGER_ROLE, owner.address);

      await vault.setStrategy(strategy.address);

      await ustToken
        .connect(alice)
        .approve(vault.address, constants.MaxUint256);
      await ustToken.connect(bob).approve(vault.address, constants.MaxUint256);
    });

    it("Mainnet fork (1)", async () => {
      let amount = utils.parseEther("10000");

      console.log(`Deposit ${utils.formatEther(amount)} UST by alice`);
      await vault.connect(alice).deposit({
        amount,
        claims: [
          {
            pct: 10000,
            beneficiary: alice.address,
            data: "0x",
          },
        ],
        lockDuration: TWO_WEEKS,
      });
      expect(await ustToken.balanceOf(vault.address)).to.be.equal(amount);
      let exchangeRate = (await mockAUstUstFeed.latestRoundData()).answer;
      console.log("ExchangeRate: ", utils.formatEther(exchangeRate));

      console.log(
        `Invest: totalUnderlying - ${utils.formatEther(
          await vault.totalUnderlying()
        )} UST`
      );
      await vault.connect(owner).updateInvested("0x");
      expect(await ustToken.balanceOf(vault.address)).to.be.equal("0");
      expect(await ustToken.balanceOf(strategy.address)).to.be.equal("0");
      expect(await strategy.pendingDeposits()).to.be.equal(amount);
      expect(await vault.totalUnderlying()).to.be.equal(amount);

      let depositOperations = await strategy.depositOperations(0);
      let expectAUstReceive = utils.parseEther("8500");
      await ForkHelpers.mintToken(
        aUstToken,
        depositOperations.operator,
        expectAUstReceive
      );
      await strategy.finishDepositStable(0);
      expect(await strategy.pendingDeposits()).to.be.equal("0");
      expect(await aUstToken.balanceOf(vault.address)).to.be.equal("0");
      expect(await aUstToken.balanceOf(strategy.address)).to.be.equal(
        expectAUstReceive
      );

      let totalUnderlying = await vault.totalUnderlying();
      exchangeRate = (await mockAUstUstFeed.latestRoundData()).answer;
      console.log("ExchangeRate: ", utils.formatEther(exchangeRate));

      console.log(
        `FinishDepositStable: totalUnderlying - ${utils.formatEther(
          totalUnderlying
        )} UST (0 UST + ${utils.formatEther(expectAUstReceive)} aUST)`
      );

      amount = utils.parseEther("1000");
      console.log(`Deposit ${utils.formatEther(amount)} UST by bob`);
      await vault.connect(bob).deposit({
        amount,
        claims: [
          {
            pct: 10000,
            beneficiary: bob.address,
            data: "0x",
          },
        ],
        lockDuration: TWO_WEEKS,
      });

      expect(await vault.totalUnderlying()).to.be.equal(
        totalUnderlying.add(amount)
      );
      totalUnderlying = await vault.totalUnderlying();

      console.log(
        `Invest: totalUnderlying - ${utils.formatEther(
          await vault.totalUnderlying()
        )} UST`
      );
      exchangeRate = (await mockAUstUstFeed.latestRoundData()).answer;
      console.log("ExchangeRate: ", utils.formatEther(exchangeRate));
      await vault.updateInvested("0x");

      exchangeRate = await (await mockAUstUstFeed.latestRoundData()).answer;
      console.log("ExchangeRate: ", utils.formatEther(exchangeRate));

      depositOperations = await strategy.depositOperations(0);
      let aUstBalance = expectAUstReceive;
      expectAUstReceive = utils.parseEther("850");
      await ForkHelpers.mintToken(
        aUstToken,
        depositOperations.operator,
        expectAUstReceive
      );
      aUstBalance = aUstBalance.add(expectAUstReceive);

      await strategy.finishDepositStable(0);
      expect(await strategy.pendingDeposits()).to.be.equal("0");
      expect(await aUstToken.balanceOf(vault.address)).to.be.equal("0");
      expect(await aUstToken.balanceOf(strategy.address)).to.be.equal(
        aUstBalance
      );

      console.log(
        `FinishDepositStable: totalUnderlying - ${utils.formatEther(
          await vault.totalUnderlying()
        )} UST (0 UST + ${utils.formatEther(aUstBalance)} aUST)`
      );
    });
  });

  // Use Mock aUST / UST Chainlink Feed to check performance fee and redeem
  describe("Use Mock aUST / UST Chainlink feed", () => {
    before(async () => {
      const MockChainlinkPriceFeedFactory = await ethers.getContractFactory(
        "MockChainlinkPriceFeed"
      );
      mockAUstUstFeed = await MockChainlinkPriceFeedFactory.deploy(18);

      const VaultFactory = await ethers.getContractFactory("Vault");
      vault = await VaultFactory.deploy(
        ustToken.address,
        TWO_WEEKS,
        INVEST_PCT,
        owner.address
      );

      const AnchorUSTStrategyFactory = await ethers.getContractFactory(
        "AnchorUSTStrategy"
      );

      strategy = await AnchorUSTStrategyFactory.deploy(
        vault.address,
        TREASURY,
        config.ethAnchorRouter,
        mockAUstUstFeed.address,
        ustToken.address,
        aUstToken.address,
        FEE_PCT,
        owner.address
      );

      await strategy.connect(owner).grantRole(MANAGER_ROLE, owner.address);

      await vault.setStrategy(strategy.address);

      await ustToken
        .connect(alice)
        .approve(vault.address, constants.MaxUint256);
      await ustToken.connect(bob).approve(vault.address, constants.MaxUint256);
    });

    it("Mainnet fork (2)", async () => {
      let amount = utils.parseEther("9000");

      console.log(`Deposit ${utils.formatEther(amount)} UST by alice`);
      await vault.connect(alice).deposit({
        amount,
        claims: [
          {
            pct: 10000,
            beneficiary: alice.address,
            data: "0x",
          },
        ],
        lockDuration: TWO_WEEKS,
      });
      expect(await ustToken.balanceOf(vault.address)).to.be.equal(amount);
      let exchangeRate = utils.parseEther("1.17");
      await mockAUstUstFeed.setAnswer(exchangeRate);

      console.log("ExchangeRate: ", utils.formatEther(exchangeRate));

      console.log(
        `Invest: totalUnderlying - ${utils.formatEther(
          await vault.totalUnderlying()
        )} UST`
      );
      await vault.connect(owner).updateInvested("0x");
      expect(await ustToken.balanceOf(vault.address)).to.be.equal("0");
      expect(await ustToken.balanceOf(strategy.address)).to.be.equal("0");
      expect(await strategy.pendingDeposits()).to.be.equal(amount);
      expect(await vault.totalUnderlying()).to.be.equal(amount);

      let depositOperations = await strategy.depositOperations(0);
      let expectAUstReceive = utils.parseEther("7600");
      await ForkHelpers.mintToken(
        aUstToken,
        depositOperations.operator,
        expectAUstReceive
      );
      await strategy.finishDepositStable(0);
      expect(await strategy.pendingDeposits()).to.be.equal("0");
      expect(await aUstToken.balanceOf(vault.address)).to.be.equal("0");
      expect(await aUstToken.balanceOf(strategy.address)).to.be.equal(
        expectAUstReceive
      );

      let totalUnderlying = await vault.totalUnderlying();

      console.log(
        `FinishDepositStable: totalUnderlying - ${utils.formatEther(
          totalUnderlying
        )} UST (0 UST + ${utils.formatEther(expectAUstReceive)} aUST)`
      );

      amount = utils.parseEther("1000");
      console.log(`Deposit ${utils.formatEther(amount)} UST by bob`);
      await vault.connect(bob).deposit({
        amount,
        claims: [
          {
            pct: 10000,
            beneficiary: bob.address,
            data: "0x",
          },
        ],
        lockDuration: TWO_WEEKS,
      });

      expect(await vault.totalUnderlying()).to.be.equal(
        totalUnderlying.add(amount)
      );
      totalUnderlying = await vault.totalUnderlying();

      console.log(
        `Invest: totalUnderlying - ${utils.formatEther(
          await vault.totalUnderlying()
        )} UST`
      );
      await vault.updateInvested("0x");

      depositOperations = await strategy.depositOperations(0);
      let aUstBalance = expectAUstReceive;
      expectAUstReceive = utils.parseEther("850");
      await ForkHelpers.mintToken(
        aUstToken,
        depositOperations.operator,
        expectAUstReceive
      );
      aUstBalance = aUstBalance.add(expectAUstReceive);

      await strategy.finishDepositStable(0);
      expect(await strategy.pendingDeposits()).to.be.equal("0");
      expect(await aUstToken.balanceOf(vault.address)).to.be.equal("0");
      expect(await aUstToken.balanceOf(strategy.address)).to.be.equal(
        aUstBalance
      );

      console.log(
        `FinishDepositStable: totalUnderlying - ${utils.formatEther(
          await vault.totalUnderlying()
        )} UST (0 UST + ${utils.formatEther(aUstBalance)} aUST)`
      );

      exchangeRate = utils.parseEther("1.3");
      await mockAUstUstFeed.setAnswer(exchangeRate);
      console.log(
        `Update exchange rate: ${utils.formatEther(
          (await mockAUstUstFeed.latestRoundData()).answer
        )}`
      );

      console.log(
        `TotalUnderlying - ${utils.formatEther(
          await vault.totalUnderlying()
        )} UST`
      );

      totalUnderlying = await vault.totalUnderlying();

      // profit: 985 UST
      let redeemAmount = utils.parseEther("5000");
      await strategy.initRedeemStable(redeemAmount);
      expect(await strategy.pendingRedeems()).to.be.equal(redeemAmount);
      expect(await vault.totalUnderlying()).to.be.equal(totalUnderlying);

      let expectUstReceive = utils.parseEther("6400");
      let redeemOperations = await strategy.redeemOperations(0);
      await ForkHelpers.mintToken(
        ustToken,
        redeemOperations.operator,
        expectUstReceive
      );

      await strategy.finishRedeemStable(0);
      let originalDeposit = utils
        .parseEther("10000")
        .mul(redeemAmount)
        .div(aUstBalance);
      let profit = expectUstReceive.sub(originalDeposit);
      let fee = profit.mul(FEE_PCT).div(DENOMINATOR);
      expect(await ustToken.balanceOf(TREASURY)).to.be.equal(fee);
      console.log(
        `Finish redeem stable: profit - ${utils.formatEther(profit)} UST`
      );
      expect(await vault.totalUnderlying()).to.be.equal(
        "10867300000000000000001"
      );
      aUstBalance = aUstBalance.sub(redeemAmount);
      expect(await aUstToken.balanceOf(strategy.address)).to.be.equal(
        aUstBalance
      );
      expect(await ustToken.balanceOf(vault.address)).to.be.equal(
        expectUstReceive.sub(fee)
      );
    });
  });
});
