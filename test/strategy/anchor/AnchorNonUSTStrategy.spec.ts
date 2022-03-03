import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, utils, constants, ContractFactory } from "ethers";
import { time } from "@openzeppelin/test-helpers";
import type {
  Vault,
  AnchorNonUSTStrategy,
  MockEthAnchorRouter,
  MockCurvePool,
  MockERC20,
  MockChainlinkPriceFeed,
  AnchorNonUSTStrategy__factory,
} from "../../../typechain";
import { generateNewAddress } from "../../shared/";

describe("AnchorNonUSTStrategy", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let strategy: AnchorNonUSTStrategy;
  let mockEthAnchorRouter: MockEthAnchorRouter;
  let mockAUstUstFeed: MockChainlinkPriceFeed;
  let mockCurvePool: MockCurvePool;
  let ustToken: MockERC20;
  let aUstToken: MockERC20;
  let underlying: MockERC20;
  let ustFeed: MockChainlinkPriceFeed;
  let underlyingFeed: MockChainlinkPriceFeed;
  const TREASURY = generateNewAddress();
  const UST_TO_UNDERLYING_RATE = utils.parseUnits("1", 30);
  const UNDERLYING_TO_UST_RATE = utils.parseUnits("0.99", 6);
  const underlyingI = 2;
  const ustI = 0;
  const PERFORMANCE_FEE_PCT = BigNumber.from("200");
  const AUST_FEED_DECIMALS = utils.parseEther("1");
  const CURVE_DECIMALS = utils.parseEther("1");
  const INVEST_PCT = BigNumber.from("9000");
  const DENOMINATOR = BigNumber.from("10000");
  const TWO_WEEKS = BigNumber.from(time.duration.days(14).toNumber());

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
    mockAUstUstFeed = await MockChainlinkPriceFeedFactory.deploy(18);

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
    await mockCurvePool.updateRate(ustI, underlyingI, UST_TO_UNDERLYING_RATE);
    await mockCurvePool.updateRate(underlyingI, ustI, UNDERLYING_TO_UST_RATE);

    await ustFeed.setAnswer(utils.parseUnits("1", 8));
    await underlyingFeed.setAnswer(utils.parseUnits("1", 8));

    const MockEthAnchorRouterFactory = await ethers.getContractFactory(
      "MockEthAnchorRouter"
    );
    mockEthAnchorRouter = await MockEthAnchorRouterFactory.deploy(
      ustToken.address,
      aUstToken.address
    );

    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.deploy(
      underlying.address,
      1,
      INVEST_PCT,
      TREASURY,
      owner.address,
      PERFORMANCE_FEE_PCT
    );
    mockAUstUstFeed = await MockChainlinkPriceFeedFactory.deploy(18);

    const AnchorNonUSTStrategyFactory = await ethers.getContractFactory(
      "AnchorNonUSTStrategy"
    );

    strategy = await AnchorNonUSTStrategyFactory.deploy(
      vault.address,
      mockEthAnchorRouter.address,
      mockAUstUstFeed.address,
      ustToken.address,
      aUstToken.address,
      owner.address,
      mockCurvePool.address,
      underlyingI,
      ustI,
      ustFeed.address,
      underlyingFeed.address
    );

    await strategy.connect(owner).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);
    await underlying
      .connect(owner)
      .approve(vault.address, constants.MaxUint256);
    await aUstToken
      .connect(owner)
      .approve(mockEthAnchorRouter.address, constants.MaxUint256);
    await ustToken
      .connect(owner)
      .approve(mockEthAnchorRouter.address, constants.MaxUint256);
  });

  describe("constructor", () => {
    let AnchorNonUSTStrategyFactory: AnchorNonUSTStrategy__factory;

    beforeEach(async () => {
      AnchorNonUSTStrategyFactory = await ethers.getContractFactory(
        "AnchorNonUSTStrategy"
      );
    });

    it("Revert if curve pool is address(0)", async () => {
      await expect(
        AnchorNonUSTStrategyFactory.deploy(
          vault.address,
          mockEthAnchorRouter.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          owner.address,
          constants.AddressZero,
          underlyingI,
          ustI,
          ustFeed.address,
          underlyingFeed.address
        )
      ).to.be.revertedWith("AnchorNonUSTStrategy: curve pool is 0x");
    });

    it("Revert if underlying is ustToken", async () => {
      const VaultFactory = await ethers.getContractFactory("Vault");
      vault = await VaultFactory.deploy(
        ustToken.address,
        1,
        INVEST_PCT,
        TREASURY,
        owner.address,
        PERFORMANCE_FEE_PCT
      );

      await expect(
        AnchorNonUSTStrategyFactory.deploy(
          vault.address,
          mockEthAnchorRouter.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          owner.address,
          mockCurvePool.address,
          underlyingI,
          ustI,
          ustFeed.address,
          underlyingFeed.address
        )
      ).to.be.revertedWith("AnchorNonUSTStrategy: invalid underlying");
    });

    it("Check initial values", async () => {
      expect(await strategy.vault()).to.be.equal(vault.address);
      expect(await strategy.underlying()).to.be.equal(underlying.address);
      expect(await strategy.ethAnchorRouter()).to.be.equal(
        mockEthAnchorRouter.address
      );
      expect(await strategy.aUstToUstFeed()).to.be.equal(
        mockAUstUstFeed.address
      );
      expect(await strategy.ustToken()).to.be.equal(ustToken.address);
      expect(await strategy.aUstToken()).to.be.equal(aUstToken.address);
      expect(await strategy.curvePool()).to.be.equal(mockCurvePool.address);
      expect(await strategy.underlyingI()).to.be.equal(underlyingI);
      expect(await strategy.ustI()).to.be.equal(ustI);
    });
  });

  describe("#invest function", () => {
    it("Revert if msg.sender is not manager", async () => {
      await expect(
        strategy
          .connect(alice)
          .invest(getInvestData(utils.parseEther("1000000000000")))
      ).to.be.revertedWith("AnchorBaseStrategy: caller is not manager");
    });

    it("Revert if data.minExchangeRate is zero", async () => {
      await expect(
        strategy.connect(manager).invest(getInvestData(BigNumber.from("0")))
      ).to.be.revertedWith("AnchorNonUSTStrategy: minExchangeRate is zero");
    });

    it("Revert if underlying balance is 0", async () => {
      await expect(
        strategy
          .connect(manager)
          .invest(getInvestData(utils.parseEther("1000000000000")))
      ).to.be.revertedWith("AnchorNonUSTStrategy: no underlying exist");
    });

    it("Should swap underlying to UST and init deposit all UST", async () => {
      const operator = await registerNewTestOperator();

      let underlyingAmount = utils.parseUnits("100", 6);
      await depositVault(underlyingAmount);

      expect(await vault.totalUnderlying()).equal(underlyingAmount);
      let investAmount = underlyingAmount.mul(INVEST_PCT).div(DENOMINATOR);
      let ustAmount = investAmount
        .mul(CURVE_DECIMALS)
        .div(UNDERLYING_TO_UST_RATE);

      const tx = await vault.updateInvested(
        getInvestData(utils.parseEther("1000000000000"))
      );

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await strategy.pendingDeposits()).equal(ustAmount);
      expect(await strategy.investedAssets()).equal(
        ustAmount.div(utils.parseUnits("1", 12))
      );
      expect(await vault.totalUnderlying()).equal(
        ustAmount
          .div(utils.parseUnits("1", 12))
          .add(underlyingAmount.sub(investAmount))
      );
      const operation = await strategy.depositOperations(0);
      expect(operation.operator).equal(operator);
      expect(operation.amount).equal(ustAmount);
      expect(await strategy.depositOperationLength()).equal(1);

      await expect(tx)
        .to.emit(strategy, "InitDepositStable")
        .withArgs(operator, 0, investAmount, ustAmount);
    });
  });

  describe("#finishRedeemStable function", () => {
    let operator0: string;
    let underlyingAmount0: BigNumber;
    let investAmount0: BigNumber;
    let ustAmount0: BigNumber;
    let aUstAmount0: BigNumber;
    let redeemAmount0: BigNumber;

    beforeEach(async () => {
      operator0 = await registerNewTestOperator();

      underlyingAmount0 = utils.parseUnits("100", 6);
      investAmount0 = underlyingAmount0.mul(INVEST_PCT).div(DENOMINATOR);

      await depositVault(underlyingAmount0);

      ustAmount0 = investAmount0
        .mul(CURVE_DECIMALS)
        .div(UNDERLYING_TO_UST_RATE);

      aUstAmount0 = utils.parseUnits("80", 18);

      await vault
        .connect(owner)
        .updateInvested(getInvestData(utils.parseEther("1000000000000")));

      await notifyDepositReturnAmount(operator0, aUstAmount0);
      await strategy.connect(manager).finishDepositStable(0);

      operator0 = await registerNewTestOperator();

      redeemAmount0 = utils.parseUnits("50", 18);
      await strategy.connect(manager).initRedeemStable(redeemAmount0);
    });

    it("Revert if msg.sender is not manager", async () => {
      await expect(
        strategy.connect(alice).finishRedeemStable(0, 100)
      ).to.be.revertedWith("AnchorBaseStrategy: caller is not manager");
    });

    it("Revert if idx is out of array", async () => {
      await expect(
        strategy.connect(manager).finishRedeemStable(1, 100)
      ).to.be.revertedWith("AnchorBaseStrategy: not running");
    });

    it("Revert if minUnderlyingAmount is zero", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      let redeemedUSTAmount0 = utils.parseUnits("55", 18);
      await notifyRedeemReturnAmount(operator0, redeemedUSTAmount0);

      await expect(
        strategy.connect(manager).finishRedeemStable(0, 0)
      ).to.be.revertedWith("AnchorNonUSTStrategy: minAmount is zero");
    });

    it("Should finish redeem operation and swap UST to underlying", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      let redeemedUSTAmount0 = utils.parseUnits("55", 18);
      await notifyRedeemReturnAmount(operator0, redeemedUSTAmount0);
      let redeemedUnderlyingAmount = redeemedUSTAmount0
        .mul(CURVE_DECIMALS)
        .div(UST_TO_UNDERLYING_RATE);

      const tx = await strategy.connect(manager).finishRedeemStable(0, 100);

      expect(await aUstToken.balanceOf(strategy.address)).equal(
        aUstAmount0.sub(redeemAmount0)
      );
      expect(await strategy.pendingRedeems()).equal(0);

      let currentStrategyInvestedInUnderlying = aUstAmount0
        .sub(redeemAmount0)
        .mul(aUstRate)
        .div(AUST_FEED_DECIMALS)
        .div(utils.parseUnits("1", 12));

      expect(await strategy.investedAssets()).equal(
        currentStrategyInvestedInUnderlying
      );
      expect(await underlying.balanceOf(vault.address)).equal(
        redeemedUnderlyingAmount.add(underlyingAmount0).sub(investAmount0)
      );
      expect(await vault.totalUnderlying()).equal(
        currentStrategyInvestedInUnderlying
          .add(redeemedUnderlyingAmount)
          .add(underlyingAmount0)
          .sub(investAmount0)
      );

      expect(await strategy.redeemOperationLength()).equal(0);

      await expect(tx)
        .to.emit(strategy, "FinishRedeemStable")
        .withArgs(
          operator0,
          redeemAmount0,
          redeemedUSTAmount0,
          redeemedUnderlyingAmount
        );
    });
  });

  describe("#_estimateUstAmountInUnderlying function", () => {
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
          lockDuration: TWO_WEEKS,
        })
      ).to.be.revertedWith("AnchorNonUSTStrategy: invalid price");
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
          lockDuration: TWO_WEEKS,
        })
      ).to.be.revertedWith("AnchorNonUSTStrategy: invalid price");
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
          lockDuration: TWO_WEEKS,
        })
      ).to.be.revertedWith("AnchorNonUSTStrategy: invalid price");
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
          lockDuration: TWO_WEEKS,
        })
      ).to.be.revertedWith("AnchorNonUSTStrategy: invalid price");
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
          lockDuration: TWO_WEEKS,
        })
      ).to.be.revertedWith("AnchorNonUSTStrategy: invalid price");
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
          lockDuration: TWO_WEEKS,
        })
      ).to.be.revertedWith("AnchorNonUSTStrategy: invalid price");
    });

    it("Calculate correct Underlying amount from UST amount", async () => {
      await registerNewTestOperator();

      let underlyingAmount = utils.parseUnits("100", 6);
      let investAmount = underlyingAmount.mul(INVEST_PCT).div(DENOMINATOR);

      await depositVault(underlyingAmount);

      let ustAmount = investAmount
        .mul(CURVE_DECIMALS)
        .div(UNDERLYING_TO_UST_RATE);

      await vault
        .connect(owner)
        .updateInvested(getInvestData(utils.parseEther("1000000000000")));

      let remainingInVault = underlyingAmount.sub(investAmount);

      expect(await strategy.investedAssets()).equal(
        ustAmount.div(utils.parseUnits("1", 12))
      );
      expect(await vault.totalUnderlying()).equal(
        ustAmount.div(utils.parseUnits("1", 12)).add(remainingInVault)
      );
    });
  });

  // Test helpers
  const registerNewTestOperator = async (): Promise<string> => {
    const operator = generateNewAddress();
    await mockEthAnchorRouter.addPendingOperator(operator);
    return operator;
  };

  const depositVault = async (amount: BigNumber) => {
    await vault.connect(owner).deposit({
      amount,
      claims: [
        {
          pct: DENOMINATOR,
          beneficiary: owner.address,
          data: "0x",
        },
      ],
      lockDuration: TWO_WEEKS,
    });
  };

  const notifyDepositReturnAmount = async (
    operator: string,
    amount: BigNumber
  ) => {
    await mockEthAnchorRouter.notifyDepositResult(operator, amount);
  };

  const notifyRedeemReturnAmount = async (
    operator: string,
    amount: BigNumber
  ) => {
    await mockEthAnchorRouter.notifyRedeemResult(operator, amount);
  };

  const setAUstRate = async (rate: BigNumber) => {
    await mockAUstUstFeed.setLatestRoundData(1, rate, 1000, 1000, 1);
  };

  const getInvestData = (minExchangeRate: BigNumber) => {
    return utils.defaultAbiCoder.encode(["uint256"], [minExchangeRate]);
  };
});
