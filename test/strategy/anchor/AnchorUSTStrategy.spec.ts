import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { time } from "@openzeppelin/test-helpers";
import { expect } from "chai";
import { BigNumber, utils, constants, ContractFactory } from "ethers";
import {
  MockChainlinkPriceFeed,
  Vault,
  AnchorUSTStrategy,
  MockEthAnchorRouter,
  MockERC20,
} from "../../../typechain";
import { generateNewAddress } from "../../shared/";

describe("AnchorUSTStrategy", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let strategy: AnchorUSTStrategy;
  let mockEthAnchorRouter: MockEthAnchorRouter;
  let mockAUstUstFeed: MockChainlinkPriceFeed;
  let ustToken: MockERC20;
  let aUstToken: MockERC20;
  let underlying: MockERC20;
  const TREASURY = generateNewAddress();
  const AUST_TO_UST_FEED_DECIMALS = utils.parseEther("1");
  const MIN_LOCK_PERIOD = 1;
  const twoWeeks = time.duration.days(14).toNumber();
  const PERFORMANCE_FEE_PCT = BigNumber.from("200");
  const INVEST_PCT = BigNumber.from("9000");
  const DENOMINATOR = BigNumber.from("10000");

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes("MANAGER_ROLE"));

  beforeEach(async () => {
    [owner, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    ustToken = await MockERC20.deploy(utils.parseEther("1000000000"));
    aUstToken = await MockERC20.deploy(utils.parseEther("1000000000"));
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
      owner.address
    );

    const AnchorUSTStrategyFactory = await ethers.getContractFactory(
      "AnchorUSTStrategy"
    );

    strategy = await AnchorUSTStrategyFactory.deploy(
      vault.address,
      TREASURY,
      mockEthAnchorRouter.address,
      mockAUstUstFeed.address,
      ustToken.address,
      aUstToken.address,
      PERFORMANCE_FEE_PCT,
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
    let AnchorUSTStrategyFactory: ContractFactory;

    beforeEach(async () => {
      AnchorUSTStrategyFactory = await ethers.getContractFactory(
        "AnchorUSTStrategy"
      );
    });

    it("Revert if owner is address(0)", async () => {
      await expect(
        AnchorUSTStrategyFactory.deploy(
          vault.address,
          TREASURY,
          mockEthAnchorRouter.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          PERFORMANCE_FEE_PCT,
          constants.AddressZero
        )
      ).to.be.revertedWith("BaseStrategy: owner is 0x");
    });

    it("Revert if ethAnchorRouter is address(0)", async () => {
      await expect(
        AnchorUSTStrategyFactory.deploy(
          vault.address,
          TREASURY,
          constants.AddressZero,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          PERFORMANCE_FEE_PCT,
          owner.address
        )
      ).to.be.revertedWith("BaseStrategy: router is 0x");
    });

    it("Revert if treasury is address(0)", async () => {
      await expect(
        AnchorUSTStrategyFactory.deploy(
          vault.address,
          constants.AddressZero,
          mockEthAnchorRouter.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          PERFORMANCE_FEE_PCT,
          owner.address
        )
      ).to.be.revertedWith("BaseStrategy: treasury is 0x");
    });

    it("Revert if performance fee is greater than 100%", async () => {
      await expect(
        AnchorUSTStrategyFactory.deploy(
          vault.address,
          TREASURY,
          mockEthAnchorRouter.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          "10001",
          owner.address
        )
      ).to.be.revertedWith("BaseStrategy: invalid performance fee");
    });

    it("Revert if vault does not have interface", async () => {
      await expect(
        AnchorUSTStrategyFactory.deploy(
          TREASURY,
          TREASURY,
          mockEthAnchorRouter.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          PERFORMANCE_FEE_PCT,
          owner.address
        )
      ).to.be.revertedWith("BaseStrategy: not an IVault");
    });

    it("Revert if underlying is not ustToken", async () => {
      const VaultFactory = await ethers.getContractFactory("Vault");
      vault = await VaultFactory.deploy(
        aUstToken.address,
        1,
        INVEST_PCT,
        owner.address
      );

      await expect(
        AnchorUSTStrategyFactory.deploy(
          vault.address,
          TREASURY,
          mockEthAnchorRouter.address,
          mockAUstUstFeed.address,
          ustToken.address,
          aUstToken.address,
          PERFORMANCE_FEE_PCT,
          owner.address
        )
      ).to.be.revertedWith("AnchorUSTStrategy: invalid underlying");
    });

    it("Check initial values", async () => {
      expect(
        await strategy.hasRole(DEFAULT_ADMIN_ROLE, owner.address)
      ).to.be.equal(true);
      expect(await strategy.hasRole(MANAGER_ROLE, vault.address)).to.be.equal(
        true
      );
      expect(await strategy.treasury()).to.be.equal(TREASURY);
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
      expect(await strategy.perfFeePct()).to.be.equal(PERFORMANCE_FEE_PCT);
    });
  });

  describe("#invest function", () => {
    it("Revert if msg.sender is not manager", async () => {
      await expect(strategy.connect(alice).invest("0x")).to.be.revertedWith(
        "BaseStrategy: caller is not manager"
      );
    });

    it("Revert if underlying balance is zero", async () => {
      await expect(strategy.connect(manager).invest("0x")).to.be.revertedWith(
        "BaseStrategy: no ust exist"
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
      ).to.be.revertedWith("BaseStrategy: invalid aUST rate");

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
      ).to.be.revertedWith("BaseStrategy: invalid aUST rate");

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
      ).to.be.revertedWith("BaseStrategy: invalid aUST rate");
    });

    it("Should init deposit stable with all underlying", async () => {
      const operator = await registerNewTestOperator();

      let underlyingAmount = utils.parseUnits("100", 18);
      await depositVault(underlyingAmount);

      let investAmount = underlyingAmount.mul(INVEST_PCT).div(DENOMINATOR);

      expect(await vault.totalUnderlying()).equal(underlyingAmount);

      const tx = await vault.connect(owner).updateInvested("0x");

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await strategy.convertedUst()).equal(0);
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
      expect(await strategy.convertedUst()).equal(0);
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
      ).to.be.revertedWith("BaseStrategy: caller is not manager");
    });

    it("Revert if idx is out of array", async () => {
      await expect(
        strategy.connect(manager).finishDepositStable(1)
      ).to.be.revertedWith("BaseStrategy: not running");
    });

    it("Revert if no aUST returned", async () => {
      await expect(
        strategy.connect(manager).finishDepositStable(0)
      ).to.be.revertedWith("BaseStrategy: no aUST returned");
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

      expect(await strategy.convertedUst()).equal(investAmount0);
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

      expect(await strategy.convertedUst()).equal(investAmount0);
      expect(await strategy.pendingDeposits()).equal(investAmount1);
      expect(await strategy.depositOperationLength()).equal(1);

      const operation0 = await strategy.depositOperations(0);
      expect(operation0.operator).equal(operator1);
      expect(operation0.amount).equal(investAmount1);
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
      ).to.be.revertedWith("BaseStrategy: caller is not manager");
    });

    it("Revert if amount is 0", async () => {
      await expect(
        strategy.connect(manager).initRedeemStable(0)
      ).to.be.revertedWith("BaseStrategy: amount 0");
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
        .withArgs(operator, redeemAmount);
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
      ).to.be.revertedWith("BaseStrategy: caller is not manager");
    });

    it("Revert if idx is out of array", async () => {
      await expect(
        strategy.connect(manager).finishRedeemStable(1)
      ).to.be.revertedWith("BaseStrategy: not running");
    });

    it("Revert if 0 UST redeemed", async () => {
      await expect(
        strategy.connect(manager).finishRedeemStable(0)
      ).to.be.revertedWith("BaseStrategy: nothing redeemed");
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

    it("Should pop finished operation", async () => {
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

    it("Should send performace fee if there is yield", async () => {
      let aUstRate = utils.parseEther("1.1");
      await setAUstRate(aUstRate);

      let redeemedUSTAmount0 = utils.parseUnits("60", 18);
      await notifyRedeemReturnAmount(operator0, redeemedUSTAmount0);

      const vaultBalanceBefore = await underlying.balanceOf(vault.address);
      const tx = await strategy.connect(manager).finishRedeemStable(0);
      const yieldAmount = redeemedUSTAmount0.sub(
        investAmount0.mul(redeemAmount0).div(aUstAmount0)
      );
      const perfFee = yieldAmount.mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR);
      expect(tx).to.emit(strategy, "PerfFeeClaimed").withArgs(perfFee);

      expect(await ustToken.balanceOf(TREASURY)).equal(perfFee);

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
        vaultBalanceBefore.add(redeemedUSTAmount0.sub(perfFee))
      );

      expect(await strategy.redeemOperationLength()).equal(0);
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
      ).to.be.revertedWith("BaseStrategy: caller is not manager");
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
        .withArgs(operator, aUstAmount0);
    });
  });

  describe("#setPerfFeePct function", () => {
    it("Revert if msg.sender is not admin", async () => {
      await expect(
        strategy.connect(alice).setPerfFeePct("100")
      ).to.be.revertedWith("BaseStrategy: caller is not admin");
    });

    it("Revert if pct is greater than 100%", async () => {
      await expect(
        strategy
          .connect(owner)
          .setPerfFeePct(DENOMINATOR.add(BigNumber.from("1")))
      ).to.be.revertedWith("BaseStrategy: invalid performance fee");
    });

    it("Should set invest percentage all by owner", async () => {
      expect(await strategy.perfFeePct()).equal(PERFORMANCE_FEE_PCT);
      const tx = await strategy.connect(owner).setPerfFeePct("100");
      expect(await strategy.perfFeePct()).equal(100);

      await expect(tx).to.emit(strategy, "PerfFeePctUpdated").withArgs("100");
    });
  });

  describe("#currentPerformanceFee function", () => {
    let underlyingAmount = utils.parseEther("100");
    let aUstAmount = utils.parseEther("80");
    let convertedUst: BigNumber;
    let aUstBalance: BigNumber;

    it("Return 0 if no UST deposited", async () => {
      expect(await strategy.currentPerformanceFee()).to.be.equal(0);
    });

    it("Return 0 if there is a loss", async () => {
      [convertedUst, aUstBalance] = await depositAndInvest(
        underlyingAmount,
        aUstAmount
      );

      await setAUstRate(utils.parseEther("1.12"));

      expect(await strategy.currentPerformanceFee()).to.be.equal(0);
    });

    it("Return correct performance fee if there is some yield", async () => {
      [convertedUst, aUstBalance] = await depositAndInvest(
        underlyingAmount,
        aUstAmount
      );

      const aUstRate = utils.parseEther("1.13");
      await setAUstRate(aUstRate);

      const ustValue = aUstAmount.mul(aUstRate).div(AUST_TO_UST_FEED_DECIMALS);

      console.log(
        "Performance fee: ",
        utils.formatUnits(
          ustValue.sub(convertedUst).mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR),
          18
        )
      );
      expect(await strategy.currentPerformanceFee()).to.be.equal(
        ustValue.sub(convertedUst).mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR)
      );
    });

    it("Return correct performance fee when there is pending redeem", async () => {
      [convertedUst, aUstBalance] = await depositAndInvest(
        underlyingAmount,
        aUstAmount
      );

      await registerNewTestOperator();
      await strategy.connect(manager).initRedeemStable(utils.parseEther("20"));

      const aUstRate = utils.parseEther("1.13");
      await setAUstRate(aUstRate);

      const ustValue = aUstAmount.mul(aUstRate).div(AUST_TO_UST_FEED_DECIMALS);

      console.log(
        "Performance fee: ",
        utils.formatUnits(
          ustValue.sub(convertedUst).mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR),
          18
        )
      );
      expect(await strategy.currentPerformanceFee()).to.be.equal(
        ustValue.sub(convertedUst).mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR)
      );
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

    it("Subtract performance fee from invested assets", async () => {
      [convertedUst, aUstBalance] = await depositAndInvest(
        underlyingAmount,
        aUstAmount
      );

      const aUstRate = utils.parseEther("1.13");
      await setAUstRate(aUstRate);

      expect(await strategy.investedAssets()).to.be.equal(
        aUstBalance
          .mul(aUstRate)
          .div(AUST_TO_UST_FEED_DECIMALS)
          .sub(await strategy.currentPerformanceFee())
      );
    });

    it("Return correct investAssets when there is pending redeem", async () => {
      [convertedUst, aUstBalance] = await depositAndInvest(
        underlyingAmount,
        aUstAmount
      );

      await registerNewTestOperator();
      await strategy.connect(manager).initRedeemStable(utils.parseEther("20"));

      const aUstRate = utils.parseEther("1.13");
      await setAUstRate(aUstRate);

      expect(await strategy.investedAssets()).to.be.equal(
        aUstBalance
          .mul(aUstRate)
          .div(AUST_TO_UST_FEED_DECIMALS)
          .sub(await strategy.currentPerformanceFee())
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
      lockDuration: twoWeeks,
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
  ): Promise<BigNumber[]> => {
    const operator = await registerNewTestOperator();
    await depositVault(underlyingAmount);
    await vault.updateInvested("0x");

    await notifyDepositReturnAmount(operator, aUstAmount);
    await strategy.connect(manager).finishDepositStable(0);

    const aUSTBalance = await aUstToken.balanceOf(strategy.address);
    const convertedUst = await strategy.convertedUst();
    return [convertedUst, aUSTBalance];
  };
});
