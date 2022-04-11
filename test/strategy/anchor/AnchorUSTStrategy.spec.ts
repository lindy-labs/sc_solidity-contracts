import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { time } from "@openzeppelin/test-helpers";
import { expect } from "chai";
import { BigNumber, utils, constants, ContractFactory } from "ethers";
import {
  MockChainlinkPriceFeed,
  Vault,
  AnchorStrategy,
  MockEthAnchorRouter,
  MockERC20,
  AnchorStrategy__factory,
} from "../../../typechain";
import { generateNewAddress } from "../../shared/";

describe("AnchorStrategy", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let strategy: AnchorStrategy;
  let mockEthAnchorRouter: MockEthAnchorRouter;
  let mockAUstUstFeed: MockChainlinkPriceFeed;
  let ustToken: MockERC20;
  let aUstToken: MockERC20;
  let underlying: MockERC20;
  const TREASURY = generateNewAddress();
  const AUST_TO_UST_FEED_DECIMALS = utils.parseEther("1");
  const MIN_LOCK_PERIOD = 1;
  const TWO_WEEKS = time.duration.days(14).toNumber();
  const PERFORMANCE_FEE_PCT = BigNumber.from("200");
  const INVEST_PCT = BigNumber.from("9000");
  const DENOMINATOR = BigNumber.from("10000");

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes("MANAGER_ROLE"));

  beforeEach(async () => {
    [owner, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    ustToken = await MockERC20.deploy(
      "UST",
      "UST",
      18,
      utils.parseEther("1000000000")
    );
    aUstToken = await MockERC20.deploy(
      "aUST",
      "aUST",
      18,
      utils.parseEther("1000000000")
    );
    underlying = ustToken;

    const MockEthAnchorRouterFactory = await ethers.getContractFactory(
      "MockEthAnchorRouter"
    );
    mockEthAnchorRouter = await MockEthAnchorRouterFactory.deploy(
      ustToken.address,
      aUstToken.address
    );

    const MockChainlinkPriceFeedFactory = await ethers.getContractFactory(
      "MockChainlinkPriceFeed"
    );
    mockAUstUstFeed = await MockChainlinkPriceFeedFactory.deploy(18);

    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.deploy(
      underlying.address,
      MIN_LOCK_PERIOD,
      INVEST_PCT,
      TREASURY,
      owner.address,
      PERFORMANCE_FEE_PCT,
      []
    );

    const AnchorStrategyFactory = await ethers.getContractFactory(
      "AnchorStrategy"
    );

    strategy = await AnchorStrategyFactory.deploy(
      vault.address,
      mockEthAnchorRouter.address,
      mockAUstUstFeed.address,
      ustToken.address,
      aUstToken.address,
      owner.address
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
    let AnchorStrategyFactory: AnchorStrategy__factory;

    beforeEach(async () => {
      AnchorStrategyFactory = await ethers.getContractFactory("AnchorStrategy");
    });

    it("Revert if owner is address(0)", async () => {
      await expect(
        AnchorStrategyFactory.deploy(
          vault.address,
          mockEthAnchorRouter.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          constants.AddressZero
        )
      ).to.be.revertedWith("AnchorStrategy: owner is 0x");
    });

    it("Revert if ethAnchorRouter is address(0)", async () => {
      await expect(
        AnchorStrategyFactory.deploy(
          vault.address,
          constants.AddressZero,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          owner.address
        )
      ).to.be.revertedWith("AnchorStrategy: router is 0x");
    });

    it("Revert if vault does not have IVault interface", async () => {
      await expect(
        AnchorStrategyFactory.deploy(
          TREASURY,
          mockEthAnchorRouter.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          owner.address
        )
      ).to.be.revertedWith("AnchorStrategy: not an IVault");
    });

    it("Revert if underlying is not ustToken", async () => {
      const VaultFactory = await ethers.getContractFactory("Vault");
      vault = await VaultFactory.deploy(
        aUstToken.address,
        1,
        INVEST_PCT,
        TREASURY,
        owner.address,
        PERFORMANCE_FEE_PCT,
        []
      );

      await expect(
        AnchorStrategyFactory.deploy(
          vault.address,
          mockEthAnchorRouter.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          owner.address
        )
      ).to.be.revertedWith("AnchorStrategy: invalid underlying");
    });

    it("Check initial values", async () => {
      expect(
        await strategy.hasRole(DEFAULT_ADMIN_ROLE, owner.address)
      ).to.be.equal(true);
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.equal(
        true
      );
      expect(await strategy.vault()).to.be.equal(vault.address);
      expect(await strategy.ethAnchorRouter()).to.be.equal(
        mockEthAnchorRouter.address
      );
      expect(await strategy.aUstToUstFeed()).to.be.equal(
        mockAUstUstFeed.address
      );
      expect(await strategy.ustToken()).to.be.equal(ustToken.address);
      expect(await strategy.aUstToken()).to.be.equal(aUstToken.address);
      expect(await strategy.hasAssets()).to.be.equal(false);
    });
  });

  describe("#invest function", () => {
    it("Revert if msg.sender is not manager", async () => {
      await expect(strategy.connect(alice).invest("0x")).to.be.revertedWith(
        "AnchorStrategy: caller is not manager"
      );
    });

    it("Revert if underlying balance is zero", async () => {
      await expect(strategy.connect(manager).invest("0x")).to.be.revertedWith(
        "AnchorStrategy: no ust exist"
      );
    });

    it("Revert if aUST/UST exchange rate is invalid", async () => {
      const operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);

      const amount0 = utils.parseUnits("100", 18);
      const aUstAmount0 = utils.parseUnits("90", 18);
      await underlying.connect(owner).transfer(vault.address, amount0);
      await vault.connect(owner).updateInvested("0x");

      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockAUstUstFeed.setAnswer(exchangeRate);

      await aUstToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, aUstAmount0);
      await mockEthAnchorRouter.notifyDepositResult(operator0, aUstAmount0);
      await strategy.connect(manager).finishDepositStable(0);

      // when price is not positive
      await mockAUstUstFeed.setLatestRoundData(1, 0, 100, 100, 1);
      await expect(
        vault.connect(owner).updateInvested("0x")
      ).to.be.revertedWith("AnchorStrategy: invalid aUST rate");

      // when round id is invalid
      await mockAUstUstFeed.setLatestRoundData(
        3,
        utils.parseEther("1"),
        100,
        100,
        1
      );
      await expect(
        vault.connect(owner).updateInvested("0x")
      ).to.be.revertedWith("AnchorStrategy: invalid aUST rate");

      // when updated time is zero
      await mockAUstUstFeed.setLatestRoundData(
        1,
        utils.parseEther("1"),
        100,
        0,
        1
      );
      await expect(
        vault.connect(owner).updateInvested("0x")
      ).to.be.revertedWith("AnchorStrategy: invalid aUST rate");
    });

    it("Should init deposit stable with all underlying", async () => {
      const operator = await registerNewTestOperator();

      let underlyingAmount = utils.parseUnits("100", 18);
      await depositVault(underlyingAmount);

      let investAmount = underlyingAmount.mul(INVEST_PCT).div(DENOMINATOR);

      expect(await vault.totalUnderlying()).equal(underlyingAmount);

      const tx = await vault.connect(owner).updateInvested("0x");

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await strategy.pendingDeposits()).equal(investAmount);
      expect(await strategy.investedAssets()).equal(investAmount);
      expect(await vault.totalUnderlying()).equal(underlyingAmount);
      const operation = await strategy.depositOperations(0);
      expect(operation.operator).equal(operator);
      expect(operation.amount).equal(investAmount);
      expect(await strategy.depositOperationLength()).equal(1);

      await expect(tx)
        .to.emit(strategy, "InitDepositStable")
        .withArgs(operator, 0, investAmount, investAmount);
    });

    it("Should be able to init deposit several times", async () => {
      const operator0 = await registerNewTestOperator();

      let underlyingBalance0 = utils.parseUnits("100", 18);
      await depositVault(underlyingBalance0);

      let investAmount0 = underlyingBalance0.mul(INVEST_PCT).div(DENOMINATOR);

      await vault.connect(owner).updateInvested("0x");

      const operator1 = await registerNewTestOperator();
      let underlyingBalance1 = utils.parseUnits("50", 18);
      await depositVault(underlyingBalance1);

      let investAmount1 = underlyingBalance1
        .add(underlyingBalance0)
        .mul(INVEST_PCT)
        .div(DENOMINATOR)
        .sub(investAmount0);

      await vault.connect(owner).updateInvested("0x");

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await strategy.pendingDeposits()).equal(
        investAmount0.add(investAmount1)
      );
      expect(await strategy.investedAssets()).equal(
        investAmount0.add(investAmount1)
      );
      expect(await vault.totalUnderlying()).equal(
        underlyingBalance0.add(underlyingBalance1)
      );
      const operation0 = await strategy.depositOperations(0);
      expect(operation0.operator).equal(operator0);
      expect(operation0.amount).equal(investAmount0);

      const operation1 = await strategy.depositOperations(1);
      expect(operation1.operator).equal(operator1);
      expect(operation1.amount).equal(investAmount1);
      expect(await strategy.depositOperationLength()).equal(2);
    });
  });

  describe("#finishDepositStable function", () => {
    let operator0: string;
    let underlyingAmount0: BigNumber;
    let investAmount0: BigNumber;
    let aUstAmount0: BigNumber;

    beforeEach(async () => {
      operator0 = await registerNewTestOperator();

      underlyingAmount0 = utils.parseUnits("100", 18);
      aUstAmount0 = utils.parseUnits("80", 18);
      await depositVault(underlyingAmount0);
      await vault.connect(owner).updateInvested("0x");
      investAmount0 = underlyingAmount0.mul(INVEST_PCT).div(DENOMINATOR);
    });

    it("Revert if msg.sender is not manager", async () => {
      await expect(
        strategy.connect(alice).finishDepositStable(0)
      ).to.be.revertedWith("AnchorStrategy: caller is not manager");
    });

    it("Revert if idx is out of array", async () => {
      await expect(
        strategy.connect(manager).finishDepositStable(1)
      ).to.be.revertedWith("AnchorStrategy: not running");
    });

    it("Revert if no aUST returned", async () => {
      await expect(
        strategy.connect(manager).finishDepositStable(0)
      ).to.be.revertedWith("AnchorStrategy: no aUST returned");
    });

    it("Should finish deposit operation", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      await notifyDepositReturnAmount(operator0, aUstAmount0);
      const tx = await strategy.connect(manager).finishDepositStable(0);

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await aUstToken.balanceOf(strategy.address)).equal(aUstAmount0);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0.mul(aUstRate).div(AUST_TO_UST_FEED_DECIMALS)
      );
      expect(await vault.totalUnderlying()).equal(
        aUstAmount0
          .mul(aUstRate)
          .div(AUST_TO_UST_FEED_DECIMALS)
          .add(underlyingAmount0.sub(investAmount0))
      );

      expect(await strategy.pendingDeposits()).equal(0);
      expect(await strategy.depositOperationLength()).equal(0);

      await expect(tx)
        .to.emit(strategy, "FinishDepositStable")
        .withArgs(operator0, investAmount0, aUstAmount0);
    });

    it("Should pop finished operation", async () => {
      const operator1 = await registerNewTestOperator();

      const underlyingAmount1 = utils.parseUnits("50", 18);
      await depositVault(underlyingAmount1);
      await vault.connect(owner).updateInvested("0x");

      let investAmount1 = underlyingAmount1
        .add(underlyingAmount0)
        .mul(INVEST_PCT)
        .div(DENOMINATOR)
        .sub(investAmount0);

      const aUstAmount1 = utils.parseUnits("50");

      await notifyDepositReturnAmount(operator0, aUstAmount0);
      await notifyDepositReturnAmount(operator1, aUstAmount1);
      await strategy.connect(manager).finishDepositStable(0);

      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await aUstToken.balanceOf(strategy.address)).equal(aUstAmount0);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0
          .mul(aUstRate)
          .div(AUST_TO_UST_FEED_DECIMALS)
          .add(investAmount1)
      );
      expect(await vault.totalUnderlying()).equal(
        aUstAmount0
          .mul(aUstRate)
          .div(AUST_TO_UST_FEED_DECIMALS)
          .add(underlyingAmount1)
          .add(underlyingAmount0)
          .sub(investAmount0)
      );

      expect(await strategy.pendingDeposits()).equal(investAmount1);
      expect(await strategy.depositOperationLength()).equal(1);

      const operation0 = await strategy.depositOperations(0);
      expect(operation0.operator).equal(operator1);
      expect(operation0.amount).equal(investAmount1);
    });

    it("Should rearrange deposit operations when not finalizing last in array", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      await notifyDepositReturnAmount(operator0, aUstAmount0);

      const underlyingAmount1 = utils.parseUnits("100", 18);
      const aUstAmount1 = utils.parseUnits("80", 18);

      const operator1 = await registerNewTestOperator();

      await depositVault(underlyingAmount1);
      await vault.connect(owner).updateInvested("0x");

      await notifyDepositReturnAmount(operator1, aUstAmount1);

      const tx = await strategy.connect(manager).finishDepositStable(0);

      expect(await strategy.depositOperationLength()).equal(1);

      await expect(tx)
        .to.emit(strategy, "RearrangeDepositOperation")
        .withArgs(operator1, operator0, 0);

      await expect(tx)
        .to.emit(strategy, "FinishDepositStable")
        .withArgs(operator0, investAmount0, aUstAmount0);
    });
  });

  describe("#initRedeemStable function", () => {
    let underlyingAmount0: BigNumber;
    let aUstAmount0: BigNumber;

    beforeEach(async () => {
      const operator = await registerNewTestOperator();

      underlyingAmount0 = utils.parseUnits("100", 18);
      aUstAmount0 = utils.parseUnits("80", 18);
      await depositVault(underlyingAmount0);
      await vault.connect(owner).updateInvested("0x");

      await notifyDepositReturnAmount(operator, aUstAmount0);
      await strategy.connect(manager).finishDepositStable(0);
    });

    it("Revert if msg.sender is not manager", async () => {
      await expect(
        strategy.connect(alice).initRedeemStable(aUstAmount0)
      ).to.be.revertedWith("AnchorStrategy: caller is not manager");
    });

    it("Revert if amount is 0", async () => {
      await expect(
        strategy.connect(manager).initRedeemStable(0)
      ).to.be.revertedWith("AnchorStrategy: amount 0");
    });

    it("Should init redeem operation", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      const operator = await registerNewTestOperator();
      const redeemAmount = utils.parseUnits("50", 18);

      const tx = await strategy.connect(manager).initRedeemStable(redeemAmount);

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await aUstToken.balanceOf(strategy.address)).equal(
        aUstAmount0.sub(redeemAmount)
      );
      expect(await strategy.pendingRedeems()).equal(redeemAmount);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0.mul(aUstRate).div(AUST_TO_UST_FEED_DECIMALS)
      );
      const operation = await strategy.redeemOperations(0);
      expect(operation.operator).equal(operator);
      expect(operation.amount).equal(redeemAmount);
      expect(await strategy.redeemOperationLength()).equal(1);

      await expect(tx)
        .to.emit(strategy, "InitRedeemStable")
        .withArgs(operator, 0, redeemAmount);
    });

    it("Should be able to init redeem several times", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      const operator0 = await registerNewTestOperator();
      const redeemAmount0 = utils.parseUnits("50", 18);
      await strategy.connect(manager).initRedeemStable(redeemAmount0);

      const operator1 = await registerNewTestOperator();
      const redeemAmount1 = utils.parseUnits("20", 18);
      await strategy.connect(manager).initRedeemStable(redeemAmount1);
      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await aUstToken.balanceOf(strategy.address)).equal(
        aUstAmount0.sub(redeemAmount0).sub(redeemAmount1)
      );
      expect(await strategy.pendingRedeems()).equal(
        redeemAmount0.add(redeemAmount1)
      );
      expect(await strategy.investedAssets()).equal(
        aUstAmount0.mul(aUstRate).div(AUST_TO_UST_FEED_DECIMALS)
      );
      const operation0 = await strategy.redeemOperations(0);
      expect(operation0.operator).equal(operator0);
      expect(operation0.amount).equal(redeemAmount0);

      const operation1 = await strategy.redeemOperations(1);
      expect(operation1.operator).equal(operator1);
      expect(operation1.amount).equal(redeemAmount1);

      expect(await strategy.redeemOperationLength()).equal(2);
    });
  });

  describe("#finishRedeemStable function", () => {
    let operator0: string;
    let underlyingAmount0: BigNumber;
    let aUstAmount0: BigNumber;
    let redeemAmount0: BigNumber;
    let investAmount0: BigNumber;

    beforeEach(async () => {
      operator0 = await registerNewTestOperator();

      underlyingAmount0 = utils.parseUnits("100", 18);
      investAmount0 = underlyingAmount0.mul(INVEST_PCT).div(DENOMINATOR);
      aUstAmount0 = utils.parseUnits("80", 18);
      await depositVault(underlyingAmount0);
      await vault.connect(owner).updateInvested("0x");

      await notifyDepositReturnAmount(operator0, aUstAmount0);
      await strategy.connect(manager).finishDepositStable(0);

      operator0 = await registerNewTestOperator();

      redeemAmount0 = utils.parseUnits("50", 18);
      await strategy.connect(manager).initRedeemStable(redeemAmount0);
    });

    it("Revert if msg.sender is not manager", async () => {
      await expect(
        strategy.connect(alice).finishRedeemStable(0)
      ).to.be.revertedWith("AnchorStrategy: caller is not manager");
    });

    it("Revert if idx is out of array", async () => {
      await expect(
        strategy.connect(manager).finishRedeemStable(1)
      ).to.be.revertedWith("AnchorStrategy: not running");
    });

    it("Revert if 0 UST redeemed", async () => {
      await expect(
        strategy.connect(manager).finishRedeemStable(0)
      ).to.be.revertedWith("AnchorStrategy: nothing redeemed");
    });

    it("Should finish redeem operation", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      let redeemedUSTAmount0 = utils.parseUnits("55", 18);
      await notifyRedeemReturnAmount(operator0, redeemedUSTAmount0);

      const tx = await strategy.connect(manager).finishRedeemStable(0);

      expect(await aUstToken.balanceOf(strategy.address)).equal(
        aUstAmount0.sub(redeemAmount0)
      );
      expect(await strategy.pendingRedeems()).equal(0);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0
          .sub(redeemAmount0)
          .mul(aUstRate)
          .div(AUST_TO_UST_FEED_DECIMALS)
      );
      expect(await vault.totalUnderlying()).equal(
        aUstAmount0
          .sub(redeemAmount0)
          .mul(aUstRate)
          .div(AUST_TO_UST_FEED_DECIMALS)
          .add(redeemedUSTAmount0)
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
          redeemedUSTAmount0
        );
    });

    it("Should pop finished operation(when no yield)", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      let redeemedUSTAmount0 = utils.parseUnits("55", 18);
      await notifyRedeemReturnAmount(operator0, redeemedUSTAmount0);

      let redeemAmount1 = utils.parseUnits("10", 18);
      const operator1 = await registerNewTestOperator();
      await strategy.connect(manager).initRedeemStable(redeemAmount1);

      await strategy.connect(manager).finishRedeemStable(0);

      expect(await aUstToken.balanceOf(strategy.address)).equal(
        aUstAmount0.sub(redeemAmount0).sub(redeemAmount1)
      );
      expect(await strategy.pendingRedeems()).equal(redeemAmount1);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0
          .sub(redeemAmount0)
          .mul(aUstRate)
          .div(AUST_TO_UST_FEED_DECIMALS)
      );

      expect(await strategy.redeemOperationLength()).equal(1);
      const operation = await strategy.redeemOperations(0);
      expect(operation.operator).equal(operator1);
      expect(operation.amount).equal(redeemAmount1);
    });

    it("Should pop finished operation(when yield generated)", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      let redeemedUSTAmount0 = utils.parseUnits("60", 18);
      await notifyRedeemReturnAmount(operator0, redeemedUSTAmount0);

      const vaultBalanceBefore = await underlying.balanceOf(vault.address);
      const tx = await strategy.connect(manager).finishRedeemStable(0);
      const yieldAmount = redeemedUSTAmount0.sub(
        investAmount0.mul(redeemAmount0).div(aUstAmount0)
      );

      expect(await aUstToken.balanceOf(strategy.address)).equal(
        aUstAmount0.sub(redeemAmount0)
      );
      expect(await strategy.pendingRedeems()).equal(0);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0
          .sub(redeemAmount0)
          .mul(aUstRate)
          .div(AUST_TO_UST_FEED_DECIMALS)
      );
      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await underlying.balanceOf(vault.address)).equal(
        vaultBalanceBefore.add(redeemedUSTAmount0)
      );

      expect(await strategy.redeemOperationLength()).equal(0);
    });

    it("Should rearrange redeem operations when not finalizing last in array", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      let redeemedUSTAmount0 = utils.parseUnits("55", 18);
      await notifyRedeemReturnAmount(operator0, redeemedUSTAmount0);

      const underlyingAmount1 = utils.parseUnits("100", 18);
      const aUstAmount1 = utils.parseUnits("80", 18);
      const operator1 = await registerNewTestOperator();
      await depositVault(underlyingAmount1);
      await vault.connect(owner).updateInvested("0x");

      await notifyDepositReturnAmount(operator1, aUstAmount1);
      await strategy.connect(manager).finishDepositStable(0);

      const operator2 = await registerNewTestOperator();

      await strategy.connect(manager).initRedeemStable(redeemAmount0);

      await notifyRedeemReturnAmount(operator2, redeemedUSTAmount0);

      const tx = await strategy.connect(manager).finishRedeemStable(0);

      expect(await strategy.redeemOperationLength()).equal(1);

      await expect(tx)
        .to.emit(strategy, "RearrangeRedeemOperation")
        .withArgs(operator2, operator0, 0);

      await expect(tx)
        .to.emit(strategy, "FinishRedeemStable")
        .withArgs(
          operator0,
          redeemAmount0,
          redeemedUSTAmount0,
          redeemedUSTAmount0
        );
    });
  });

  describe("#withdrawAllToVault function", () => {
    const underlyingAmount0 = utils.parseUnits("100", 18);
    const aUstAmount0 = utils.parseUnits("80", 18);

    beforeEach(async () => {
      const operator0 = await registerNewTestOperator();

      await depositVault(underlyingAmount0);
      await vault.connect(owner).updateInvested("0x");

      await notifyDepositReturnAmount(operator0, aUstAmount0);
      await strategy.connect(manager).finishDepositStable(0);
    });

    it("Revert if msg.sender is not manager", async () => {
      await expect(
        strategy.connect(alice).withdrawAllToVault()
      ).to.be.revertedWith("AnchorStrategy: caller is not manager");
    });

    it("Should init redeem all aUST", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      const operator = await registerNewTestOperator();

      const tx = await strategy.connect(manager).withdrawAllToVault();

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await aUstToken.balanceOf(strategy.address)).equal(0);
      expect(await strategy.pendingRedeems()).equal(aUstAmount0);

      const operation = await strategy.redeemOperations(0);
      expect(operation.operator).equal(operator);
      expect(operation.amount).equal(aUstAmount0);
      expect(await strategy.redeemOperationLength()).equal(1);

      await expect(tx)
        .to.emit(strategy, "InitRedeemStable")
        .withArgs(operator, 0, aUstAmount0);
    });
  });

  describe("#investedAssets function", () => {
    let underlyingAmount = utils.parseEther("100");
    let aUstAmount = utils.parseEther("80");
    let convertedUst: BigNumber;
    let aUstBalance: BigNumber;

    it("Return 0 if no UST deposited", async () => {
      expect(await strategy.investedAssets()).to.be.equal(0);
    });

    it("Include pending deposits", async () => {
      await depositVault(underlyingAmount);
      await registerNewTestOperator();
      await vault.updateInvested("0x");

      expect(await strategy.investedAssets()).to.be.equal(
        underlyingAmount.mul(INVEST_PCT).div(DENOMINATOR)
      );
    });

    it("Return correct investAssets when there is no pending redeem", async () => {
      aUstBalance = await depositAndInvest(underlyingAmount, aUstAmount);

      const aUstRate = utils.parseEther("1.13");
      await setAUstRate(aUstRate);

      expect(await strategy.investedAssets()).to.be.equal(
        aUstBalance.mul(aUstRate).div(AUST_TO_UST_FEED_DECIMALS)
      );
    });

    it("Return correct investAssets when there is pending redeem", async () => {
      aUstBalance = await depositAndInvest(underlyingAmount, aUstAmount);

      await registerNewTestOperator();
      await strategy.connect(manager).initRedeemStable(utils.parseEther("20"));

      const aUstRate = utils.parseEther("1.13");
      await setAUstRate(aUstRate);

      expect(await strategy.investedAssets()).to.be.equal(
        aUstBalance.mul(aUstRate).div(AUST_TO_UST_FEED_DECIMALS)
      );
    });
  });

  describe("#hasAssets function", () => {
    it("Return false if nothing invested", async () => {
      expect(await strategy.hasAssets()).to.be.equal(false);
    });

    it("Return true if there is pendingDeposits", async () => {
      await depositVault(utils.parseEther("100"));
      await registerNewTestOperator();
      await vault.updateInvested("0x");

      expect(await strategy.hasAssets()).to.be.equal(true);
    });

    it("Return true if partical redeemed", async () => {
      await depositVault(utils.parseEther("100"));
      let operator = await registerNewTestOperator();
      await vault.updateInvested("0x");

      await notifyDepositReturnAmount(operator, utils.parseEther("90"));
      await strategy.connect(manager).finishDepositStable(0);

      operator = await registerNewTestOperator();
      await strategy.connect(manager).initRedeemStable(utils.parseEther("30"));
      expect(await strategy.hasAssets()).to.be.equal(true);

      await notifyRedeemReturnAmount(operator, utils.parseEther("35"));

      await strategy.connect(manager).finishRedeemStable(0);

      expect(await strategy.hasAssets()).to.be.equal(true);
    });

    it("Return true if pendingRedeem exist after all redeem initialized", async () => {
      await depositVault(utils.parseEther("100"));
      const operator = await registerNewTestOperator();
      await vault.updateInvested("0x");

      await notifyDepositReturnAmount(operator, utils.parseEther("90"));
      await strategy.connect(manager).finishDepositStable(0);

      await registerNewTestOperator();
      await strategy
        .connect(manager)
        .initRedeemStable(await aUstToken.balanceOf(strategy.address));
      expect(await strategy.hasAssets()).to.be.equal(true);
    });

    it("Return false after all aUST redeemed", async () => {
      await depositVault(utils.parseEther("100"));
      let operator = await registerNewTestOperator();
      await vault.updateInvested("0x");

      await notifyDepositReturnAmount(operator, utils.parseEther("90"));
      await strategy.connect(manager).finishDepositStable(0);

      operator = await registerNewTestOperator();
      await strategy
        .connect(manager)
        .initRedeemStable(await aUstToken.balanceOf(strategy.address));

      await notifyRedeemReturnAmount(operator, utils.parseEther("105"));

      await strategy.connect(manager).finishRedeemStable(0);

      expect(await strategy.hasAssets()).to.be.equal(false);
    });

    it("Return true if all aUST redeem finished after new init deposit stable", async () => {
      await depositVault(utils.parseEther("100"));
      let operator = await registerNewTestOperator();
      await vault.updateInvested("0x");

      await notifyDepositReturnAmount(operator, utils.parseEther("90"));
      await strategy.connect(manager).finishDepositStable(0);

      operator = await registerNewTestOperator();
      await strategy
        .connect(manager)
        .initRedeemStable(await aUstToken.balanceOf(strategy.address));

      await notifyRedeemReturnAmount(operator, utils.parseEther("105"));

      await setAUstRate(utils.parseEther("1.1"));
      await depositVault(utils.parseEther("50"));
      await registerNewTestOperator();
      await vault.updateInvested("0x");

      await strategy.connect(manager).finishRedeemStable(0);

      expect(await strategy.hasAssets()).to.be.equal(true);
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
      inputToken: underlying.address,
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

  const depositAndInvest = async (
    underlyingAmount: BigNumber,
    aUstAmount: BigNumber
  ): Promise<BigNumber> => {
    const operator = await registerNewTestOperator();
    await depositVault(underlyingAmount);
    await vault.updateInvested("0x");

    await notifyDepositReturnAmount(operator, aUstAmount);
    await strategy.connect(manager).finishDepositStable(0);

    const aUSTBalance = await aUstToken.balanceOf(strategy.address);
    return aUSTBalance;
  };
});
