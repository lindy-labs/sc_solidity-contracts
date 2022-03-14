import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { time } from "@openzeppelin/test-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, utils, constants } from "ethers";
import {
  Vault,
  AnchorNonUSTStrategy,
  IERC20,
  MockChainlinkPriceFeed,
  MockChainlinkPriceFeed__factory,
  IERC20__factory,
} from "../../../../typechain";
import { generateNewAddress, ForkHelpers } from "../../../shared/";
import config from "./config.json";

describe("AnchorNonUSTStrategy Mainnet fork", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let vault: Vault;
  let strategy: AnchorNonUSTStrategy;
  let ustToken: IERC20;
  let aUstToken: IERC20;
  let usdtToken: IERC20;
  let usdcToken: IERC20;
  let daiToken: IERC20;
  // MockChainlinkPriceFeed has same interface as Mainnet, so we can use it for test
  let mockAUstUstFeed: MockChainlinkPriceFeed;
  const TWO_WEEKS = time.duration.days(14).toNumber();
  const INVEST_PCT = 10000; // set 100% for test
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from("200");
  const FORK_BLOCK = 14023000;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes("MANAGER_ROLE"));

  before(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);
    [owner, alice, bob] = await ethers.getSigners();

    daiToken = IERC20__factory.connect(config.dai, owner);
    usdcToken = IERC20__factory.connect(config.usdc, owner);
    usdtToken = IERC20__factory.connect(config.usdt, owner);
    ustToken = IERC20__factory.connect(config.ust, owner);
    aUstToken = IERC20__factory.connect(config.aUst, owner);

    await ForkHelpers.mintToken(
      usdtToken,
      alice,
      utils.parseUnits("100000000000", 6)
    );
    await ForkHelpers.mintToken(
      usdtToken,
      bob,
      utils.parseUnits("100000000000", 6)
    );
  });

  describe("Use Mainnet aUST / UST Chainlink feed (Underlying: USDT)", () => {
    before(async () => {
      mockAUstUstFeed = new MockChainlinkPriceFeed__factory(owner).attach(
        config.aUstUstFeed
      );

      const VaultFactory = await ethers.getContractFactory("Vault");
      vault = await VaultFactory.deploy(
        usdtToken.address,
        TWO_WEEKS,
        INVEST_PCT,
        TREASURY,
        owner.address,
        PERFORMANCE_FEE_PCT
      );

      const AnchorNonUSTStrategyFactory = await ethers.getContractFactory(
        "AnchorNonUSTStrategy"
      );

      strategy = await AnchorNonUSTStrategyFactory.deploy(
        vault.address,
        config.ethAnchorRouter,
        config.aUstUstFeed,
        ustToken.address,
        aUstToken.address,
        owner.address,
        config.curve,
        config.usdtI,
        config.ustI,
        config.ustFeed,
        config.usdtFeed
      );

      await strategy.connect(owner).grantRole(MANAGER_ROLE, owner.address);

      await vault.setStrategy(strategy.address);

      await usdtToken
        .connect(alice)
        .approve(vault.address, constants.MaxUint256);
      await usdtToken.connect(bob).approve(vault.address, constants.MaxUint256);
    });

    it("Mainnet fork (1)", async () => {
      let amount = utils.parseUnits("10000", 6);

      console.log(`Deposit ${utils.formatUnits(amount, 6)} USDT by alice`);
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
      expect(await usdtToken.balanceOf(vault.address)).to.be.equal(amount);
      let exchangeRate = (await mockAUstUstFeed.latestRoundData()).answer;
      console.log("ExchangeRate: ", utils.formatEther(exchangeRate));

      await vault
        .connect(owner)
        .updateInvested(getInvestData(BigNumber.from("1000")));
      console.log(
        `Invest: totalUnderlying - ${utils.formatUnits(
          await vault.totalUnderlying(),
          6
        )} USDT`
      );

      expect(await ustToken.balanceOf(vault.address)).to.be.equal("0");
      expect(await ustToken.balanceOf(strategy.address)).to.be.equal("0");
      expect(await usdtToken.balanceOf(vault.address)).to.be.equal("0");
      expect(await usdtToken.balanceOf(strategy.address)).to.be.equal("0");
      expect(await strategy.pendingDeposits()).to.be.equal(
        "9984797021624030505513" // raw data in fork block
      );
      let totalUnderlying = BigNumber.from(await vault.totalUnderlying());

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

      exchangeRate = (await mockAUstUstFeed.latestRoundData()).answer;
      console.log("ExchangeRate: ", utils.formatEther(exchangeRate));

      totalUnderlying = await vault.totalUnderlying();
      console.log(
        `FinishDepositStable: totalUnderlying - ${utils.formatUnits(
          totalUnderlying,
          6
        )} USDT (0 USDT + 0 UST + ${utils.formatEther(expectAUstReceive)} aUST)`
      );

      expect(await vault.totalUnderlying()).to.be.equal(totalUnderlying);

      amount = utils.parseUnits("1000", 6);
      console.log(`Deposit ${utils.formatUnits(amount, 6)} USDT by bob`);
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

      console.log((await vault.totalUnderlying()).toString());
      expect(await usdtToken.balanceOf(vault.address)).to.be.equal(amount);
      expect(await vault.totalUnderlying()).to.be.equal(
        totalUnderlying.add(amount)
      );
      totalUnderlying = totalUnderlying.add(amount);

      console.log(
        `Invest: totalUnderlying - ${utils.formatUnits(
          totalUnderlying,
          6
        )} USDT`
      );
      exchangeRate = (await mockAUstUstFeed.latestRoundData()).answer;
      console.log("ExchangeRate: ", utils.formatEther(exchangeRate));
      await vault.updateInvested(getInvestData(BigNumber.from("1000")));

      exchangeRate = (await mockAUstUstFeed.latestRoundData()).answer;
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
        `FinishDepositStable: totalUnderlying - ${utils.formatUnits(
          await vault.totalUnderlying(),
          6
        )} USDT (${utils.formatUnits(
          await usdtToken.balanceOf(strategy.address),
          6
        )} USDT + ${utils.formatEther(
          await ustToken.balanceOf(strategy.address)
        )} UST + ${utils.formatEther(
          await aUstToken.balanceOf(strategy.address)
        )} aUST)`
      );
    });

    it("Revert vault.updateInvested if exchanged rate is lower than minimum exchange rate.", async () => {
      let amount = utils.parseUnits("10000", 6);

      console.log(`Deposit ${utils.formatUnits(amount, 6)} USDT by alice`);
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
      let exchangeRate = (await mockAUstUstFeed.latestRoundData()).answer;
      console.log("ExchangeRate: ", utils.formatEther(exchangeRate));

      await expect(
        vault
          .connect(owner)
          .updateInvested(getInvestData(utils.parseUnits("1.1", 30)))
      ).to.revertedWith("Too few coins in result");
    });
  });

  // Use Mock aUST / UST Chainlink Feed to check performance fee and redeem
  describe("Use Mock aUST / UST Chainlink feed (Underlying: USDT)", () => {
    before(async () => {
      const MockChainlinkPriceFeedFactory = await ethers.getContractFactory(
        "MockChainlinkPriceFeed"
      );
      mockAUstUstFeed = await MockChainlinkPriceFeedFactory.deploy(18);

      const VaultFactory = await ethers.getContractFactory("Vault");
      vault = await VaultFactory.deploy(
        usdtToken.address,
        TWO_WEEKS,
        INVEST_PCT,
        TREASURY,
        owner.address,
        PERFORMANCE_FEE_PCT
      );

      const AnchorNonUSTStrategyFactory = await ethers.getContractFactory(
        "AnchorNonUSTStrategy"
      );

      strategy = await AnchorNonUSTStrategyFactory.deploy(
        vault.address,
        config.ethAnchorRouter,
        mockAUstUstFeed.address,
        ustToken.address,
        aUstToken.address,
        owner.address,
        config.curve,
        config.usdtI,
        config.ustI,
        config.ustFeed,
        config.usdtFeed
      );

      await strategy.connect(owner).grantRole(MANAGER_ROLE, owner.address);

      await vault.setStrategy(strategy.address);

      await usdtToken
        .connect(alice)
        .approve(vault.address, constants.MaxUint256);
      await usdtToken.connect(bob).approve(vault.address, constants.MaxUint256);
    });

    it("Mainnet fork (2)", async () => {
      let amount = utils.parseUnits("9000", 6);

      console.log(`Deposit ${utils.formatUnits(amount, 6)} USDT by alice`);
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
      expect(await usdtToken.balanceOf(vault.address)).to.be.equal(amount);
      let exchangeRate = utils.parseEther("1.17");
      await mockAUstUstFeed.setAnswer(exchangeRate);

      console.log("ExchangeRate: ", utils.formatEther(exchangeRate));

      console.log(
        `Invest: totalUnderlying - ${utils.formatUnits(
          await vault.totalUnderlying(),
          6
        )} USDT`
      );
      await vault
        .connect(owner)
        .updateInvested(getInvestData(BigNumber.from("1000")));
      expect(await usdtToken.balanceOf(vault.address)).to.be.equal("0");
      expect(await usdtToken.balanceOf(strategy.address)).to.be.equal("0");
      expect(await strategy.pendingDeposits()).to.be.equal(
        "8986216514701659263596" // raw data in fork block
      );
      console.log(
        `Invest after: totalUnderlying - ${utils.formatUnits(
          await vault.totalUnderlying(),
          6
        )} USDT`
      );

      expect(await vault.totalUnderlying()).to.be.equal(
        "8993877694" // raw data in fork block
      );

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
        `FinishDepositStable: totalUnderlying - ${utils.formatUnits(
          totalUnderlying,
          6
        )} USDT (0 USDT + 0 UST + ${utils.formatEther(expectAUstReceive)} aUST)`
      );

      amount = utils.parseUnits("1000", 6);
      console.log(`Deposit ${utils.formatUnits(amount, 6)} USDT by bob`);
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
      await vault.updateInvested(getInvestData(BigNumber.from("1000")));

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
        `FinishDepositStable: totalUnderlying - ${utils.formatUnits(
          await vault.totalUnderlying(),
          6
        )} USDT (0 USDT + ${utils.formatEther(aUstBalance)} aUST)`
      );

      exchangeRate = utils.parseEther("1.3");
      await mockAUstUstFeed.setAnswer(exchangeRate);
      console.log(
        `Update exchange rate: ${utils.formatEther(
          (await mockAUstUstFeed.latestRoundData()).answer
        )}`
      );

      console.log(
        `TotalUnderlying - ${utils.formatUnits(
          await vault.totalUnderlying(),
          6
        )} USDT`
      );

      totalUnderlying = await vault.totalUnderlying();

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

      await strategy.finishRedeemStable(0, "100000000");

      expect(await vault.totalUnderlying()).to.be.equal("10891563662");
      aUstBalance = aUstBalance.sub(redeemAmount);
      expect(await aUstToken.balanceOf(strategy.address)).to.be.equal(
        aUstBalance
      );
      expect(await usdtToken.balanceOf(vault.address)).to.be.equal(
        "6402739985"
      );
    });

    it("Revert strategy.finishRedeemStable if received underlying is lower than minAmount", async () => {
      let amount = utils.parseUnits("9000", 6);

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

      await vault
        .connect(owner)
        .updateInvested(getInvestData(BigNumber.from("1000")));

      let depositOperations = await strategy.depositOperations(0);
      let expectAUstReceive = utils.parseEther("7600");
      await ForkHelpers.mintToken(
        aUstToken,
        depositOperations.operator,
        expectAUstReceive
      );
      await strategy.finishDepositStable(0);

      let redeemAmount = utils.parseEther("5000");
      await strategy.initRedeemStable(redeemAmount);

      let expectUstReceive = utils.parseEther("6400");
      let redeemOperations = await strategy.redeemOperations(0);
      await ForkHelpers.mintToken(
        ustToken,
        redeemOperations.operator,
        expectUstReceive
      );

      await expect(
        strategy.finishRedeemStable(0, utils.parseUnits("6500", 6))
      ).to.revertedWith("Too few coins in result");
    });
  });

  const getInvestData = (minExchangeRate: BigNumber) => {
    return utils.defaultAbiCoder.encode(["uint256"], [minExchangeRate]);
  };
});
