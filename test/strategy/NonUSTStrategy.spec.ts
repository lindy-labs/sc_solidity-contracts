import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, utils, constants } from "ethers";
import type {
  Vault,
  NonUSTStrategy,
  MockEthAnchorRouter,
  MockExchangeRateFeeder,
  MockCurvePool,
  MockERC20,
  MockChainlinkPriceFeed,
} from "../../typechain";
import { generateNewAddress } from "../shared/";

describe("EthAnchorNonUSTStrategy", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let strategy: NonUSTStrategy;
  let mockEthAnchorRouter: MockEthAnchorRouter;
  let mockExchangeRateFeeder: MockExchangeRateFeeder;
  let mockCurvePool: MockCurvePool;
  let ustToken: MockERC20;
  let aUstToken: MockERC20;
  let underlying: MockERC20;
  let ustFeed: MockChainlinkPriceFeed;
  let underlyingFeed: MockChainlinkPriceFeed;
  const treasury = generateNewAddress();
  const ustToUnderlyingRate = utils.parseUnits("1", 30);
  const underlyingToUstRate = utils.parseUnits("1", 6);
  const underlyingI = 2;
  const ustI = 0;
  const perfFeePct = BigNumber.from("200");
  const DENOMINATOR = BigNumber.from("10000");

  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes("MANAGER_ROLE"));

  beforeEach(async () => {
    [owner, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    ustToken = await MockERC20.deploy(utils.parseEther("1000000000"));
    aUstToken = await MockERC20.deploy(utils.parseEther("1000000000"));
    underlying = await MockERC20.deploy(utils.parseEther("1000000000"));
    await underlying.updateDecimals(6);

    const MockChainlinkPriceFeedFactory = await ethers.getContractFactory(
      "MockChainlinkPriceFeed"
    );
    ustFeed = await MockChainlinkPriceFeedFactory.deploy(8);
    underlyingFeed = await MockChainlinkPriceFeedFactory.deploy(8);

    const MockCurvePoolFactory = await ethers.getContractFactory(
      "MockCurvePool"
    );
    mockCurvePool = await MockCurvePoolFactory.deploy();
    await mockCurvePool.addToken(ustI, ustToken.address);
    await mockCurvePool.addToken(underlyingI, underlying.address);
    await ustToken.transfer(mockCurvePool.address, utils.parseEther("1000000"));
    await underlying.transfer(
      mockCurvePool.address,
      utils.parseEther("1000000")
    );
    await mockCurvePool.updateRate(ustI, underlyingI, ustToUnderlyingRate);
    await mockCurvePool.updateRate(underlyingI, ustI, underlyingToUstRate);

    await ustFeed.setLatestRoundData(1, utils.parseUnits("1", 8), 100, 100, 1);
    await underlyingFeed.setLatestRoundData(
      1,
      utils.parseUnits("1", 8),
      100,
      100,
      1
    );

    const MockEthAnchorRouterFactory = await ethers.getContractFactory(
      "MockEthAnchorRouter"
    );
    mockEthAnchorRouter = await MockEthAnchorRouterFactory.deploy(
      ustToken.address,
      aUstToken.address
    );

    const MockExchangeRateFeederFactory = await ethers.getContractFactory(
      "MockExchangeRateFeeder"
    );
    mockExchangeRateFeeder = await MockExchangeRateFeederFactory.deploy();

    const MockVaultFactory = await ethers.getContractFactory("MockVault");
    vault = await MockVaultFactory.deploy(underlying.address, 0, "10000");

    const NonUSTStrategyFactory = await ethers.getContractFactory(
      "NonUSTStrategy"
    );

    strategy = await NonUSTStrategyFactory.deploy(
      vault.address,
      treasury,
      mockEthAnchorRouter.address,
      mockExchangeRateFeeder.address,
      ustToken.address,
      aUstToken.address,
      perfFeePct,
      owner.address,
      mockCurvePool.address,
      underlyingI,
      ustI
    );

    await strategy.connect(owner).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);
  });

  describe("#initializeStrategy function", () => {
    it("Revert if msg.sender is not admin", async () => {
      await expect(
        strategy
          .connect(alice)
          .initializeStrategy(ustFeed.address, underlyingFeed.address)
      ).to.be.revertedWith("BaseStrategy: caller is not admin");
    });

    it("Initialize by admin", async () => {
      const tx = await strategy
        .connect(owner)
        .initializeStrategy(ustFeed.address, underlyingFeed.address);

      expect(await strategy.ustFeed()).to.be.equal(ustFeed.address);
      expect(await strategy.underlyingFeed()).to.be.equal(
        underlyingFeed.address
      );
      expect(await strategy.initialized()).to.be.equal(true);

      await expect(tx).to.emit(strategy, "Initialized");
    });

    it("Revert if already initialized", async () => {
      await initializeStrategy();

      await expect(
        strategy
          .connect(owner)
          .initializeStrategy(ustFeed.address, underlyingFeed.address)
      ).to.be.revertedWith("already initialized");
    });
  });

  describe("#doHardWork function", () => {
    it("Revert if not initialized", async () => {
      await expect(strategy.connect(manager).doHardWork()).to.be.revertedWith(
        "not initialized"
      );
    });

    it("Revert if msg.sender is not manager", async () => {
      await initializeStrategy();

      await expect(strategy.connect(alice).doHardWork()).to.be.revertedWith(
        "BaseStrategy: caller is not manager"
      );
    });

    it("Revert if underlying balance is zero", async () => {
      await initializeStrategy();

      await expect(strategy.connect(manager).doHardWork()).to.be.revertedWith(
        "balance 0"
      );
    });

    it("Should swap underlying to UST and init deposit all UST", async () => {
      await initializeStrategy();

      const operator = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator);

      let underlyingBalance = utils.parseUnits("100", 6);
      await underlying
        .connect(owner)
        .transfer(vault.address, underlyingBalance);

      expect(await vault.totalUnderlying()).equal(underlyingBalance);
      let ustBalance = underlyingBalance
        .mul(utils.parseEther("1"))
        .div(underlyingToUstRate);
      await vault.updateInvested();
      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await strategy.convertedUst()).equal(0);
      expect(await strategy.pendingDeposits()).equal(ustBalance);
      expect(await strategy.investedAssets()).equal(underlyingBalance);
      const operation = await strategy.depositOperations(0);
      expect(operation.operator).equal(operator);
      expect(operation.amount).equal(ustBalance);
      expect(await strategy.depositOperationLength()).equal(1);
    });
  });

  describe("#finishRedeemStable function", () => {
    let operator0: string;
    let amount0: BigNumber;
    let aUstAmount0: BigNumber;
    let redeemAmount0: BigNumber;

    beforeEach(async () => {
      await initializeStrategy();

      operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);

      amount0 = utils.parseUnits("100", 6);
      aUstAmount0 = utils.parseUnits("90", 18);
      await underlying.connect(owner).transfer(strategy.address, amount0);
      await strategy.connect(manager).doHardWork();

      await aUstToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, aUstAmount0);
      await mockEthAnchorRouter.notifyDepositResult(operator0, aUstAmount0);
      await strategy.connect(manager).finishDepositStable(0);

      operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);

      redeemAmount0 = utils.parseUnits("50", 18);
      await strategy.connect(manager).initRedeemStable(redeemAmount0);
    });

    it("Revert if msg.sender is not manager", async () => {
      await expect(
        strategy.connect(alice).finishRedeemStable(0)
      ).to.be.revertedWith("BaseStrategy: caller is not manager");
    });

    it("Revert if idx is out of array", async () => {
      await expect(
        strategy.connect(manager).finishRedeemStable(1)
      ).to.be.revertedWith("not running");
    });

    it("Should finish redeem operation and swap UST to underlying", async () => {
      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      let redeemedAmount0 = utils.parseUnits("40", 18);
      await ustToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, redeemedAmount0);
      await mockEthAnchorRouter.notifyRedeemResult(operator0, redeemedAmount0);

      let underlyingAmount = redeemedAmount0
        .mul(utils.parseEther("1"))
        .div(ustToUnderlyingRate);
      await strategy.connect(manager).finishRedeemStable(0);
      expect(await ustToken.balanceOf(strategy.address)).equal(0);
      expect(await aUstToken.balanceOf(strategy.address)).equal(
        aUstAmount0.sub(redeemAmount0)
      );
      expect(await strategy.pendingRedeems()).equal(0);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0
          .sub(redeemAmount0)
          .mul(exchangeRate)
          .div(utils.parseEther("1"))
          .mul(utils.parseEther("1"))
          .div(ustToUnderlyingRate)
      );

      expect(await strategy.redeemOperationLength()).equal(0);
    });

    it("moves the funds to the vault", async () => {
      const exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      const redeemedAmount = utils.parseUnits("40", 18);
      await ustToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, redeemedAmount);
      await mockEthAnchorRouter.notifyRedeemResult(operator0, redeemedAmount);

      await strategy.connect(manager).finishRedeemStable(0);

      let underlyingAmount = redeemedAmount
        .mul(utils.parseEther("1"))
        .div(ustToUnderlyingRate);

      expect(await underlying.balanceOf(vault.address)).to.eq(underlyingAmount);
    });
  });

  describe("#_estimateInvestedAmountInUnderlying function", () => {
    beforeEach(async () => {
      await underlying.transfer(alice.address, utils.parseEther("1000000"));

      await initializeStrategy();
      await underlying
        .connect(alice)
        .approve(vault.address, constants.MaxUint256);
    });

    it("Revert if UST price is not positive", async () => {
      await ustFeed.setLatestRoundData(1, 0, 100, 100, 1);
      await underlyingFeed.setLatestRoundData(1, 10, 100, 100, 1);

      const amount = utils.parseEther("10000");

      await expect(
        vault.connect(alice).deposit({
          amount,
          claims: [
            {
              pct: 10000,
              beneficiary: alice.address,
              data: "0x",
            },
          ],
          lockedUntil: 0,
        })
      ).to.be.revertedWith("invalid price");
    });

    it("Revert if underlying price is not positive", async () => {
      await ustFeed.setLatestRoundData(1, 10, 100, 100, 1);
      await underlyingFeed.setLatestRoundData(1, 0, 100, 100, 1);

      const amount = utils.parseEther("10000");

      await expect(
        vault.connect(alice).deposit({
          amount,
          claims: [
            {
              pct: 10000,
              beneficiary: alice.address,
              data: "0x",
            },
          ],
          lockedUntil: 0,
        })
      ).to.be.revertedWith("invalid price");
    });

    it("Revert if UST feed round id is invalid", async () => {
      await ustFeed.setLatestRoundData(3, 10, 100, 100, 2);
      await underlyingFeed.setLatestRoundData(1, 10, 100, 100, 1);

      const amount = utils.parseEther("10000");

      await expect(
        vault.connect(alice).deposit({
          amount,
          claims: [
            {
              pct: 10000,
              beneficiary: alice.address,
              data: "0x",
            },
          ],
          lockedUntil: 0,
        })
      ).to.be.revertedWith("invalid price");
    });

    it("Revert if underlying feed round id is invalid", async () => {
      await ustFeed.setLatestRoundData(1, 10, 100, 100, 1);
      await underlyingFeed.setLatestRoundData(3, 10, 100, 100, 2);

      const amount = utils.parseEther("10000");

      await expect(
        vault.connect(alice).deposit({
          amount,
          claims: [
            {
              pct: 10000,
              beneficiary: alice.address,
              data: "0x",
            },
          ],
          lockedUntil: 0,
        })
      ).to.be.revertedWith("invalid price");
    });

    it("Revert if UST feed updated time is zero", async () => {
      await ustFeed.setLatestRoundData(1, 10, 100, 0, 1);
      await underlyingFeed.setLatestRoundData(1, 10, 100, 100, 1);

      const amount = utils.parseEther("10000");

      await expect(
        vault.connect(alice).deposit({
          amount,
          claims: [
            {
              pct: 10000,
              beneficiary: alice.address,
              data: "0x",
            },
          ],
          lockedUntil: 0,
        })
      ).to.be.revertedWith("invalid price");
    });

    it("Revert if underlying feed updated time is zero", async () => {
      await ustFeed.setLatestRoundData(1, 10, 100, 100, 1);
      await underlyingFeed.setLatestRoundData(1, 10, 100, 0, 1);

      const amount = utils.parseEther("10000");

      await expect(
        vault.connect(alice).deposit({
          amount,
          claims: [
            {
              pct: 10000,
              beneficiary: alice.address,
              data: "0x",
            },
          ],
          lockedUntil: 0,
        })
      ).to.be.revertedWith("invalid price");
    });
  });

  // Test helpers
  const initializeStrategy = async () => {
    await strategy
      .connect(owner)
      .initializeStrategy(ustFeed.address, underlyingFeed.address);
  };
});
