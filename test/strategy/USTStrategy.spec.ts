import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, utils, constants, ContractFactory } from "ethers";
import {
  MockExchangeRateFeeder,
  Vault,
  USTStrategy,
  MockEthAnchorRouter,
  MockERC20,
} from "../../typechain";
import { generateNewAddress } from "../shared/";

describe("USTStrategy", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let manager: SignerWithAddress;
  let vault: Vault;
  let strategy: USTStrategy;
  let mockEthAnchorRouter: MockEthAnchorRouter;
  let mockExchangeRateFeeder: MockExchangeRateFeeder;
  let ustToken: MockERC20;
  let aUstToken: MockERC20;
  let underlying: MockERC20;
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from("200");
  const INVEST_PCT = BigNumber.from("10000");
  const DENOMINATOR = BigNumber.from("10000");

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const MANAGER_ROLE = utils.keccak256(utils.toUtf8Bytes("MANAGER_ROLE"));

  beforeEach(async () => {
    [owner, alice, manager] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    ustToken = (await MockERC20.deploy(
      utils.parseEther("1000000000")
    )) as MockERC20;
    aUstToken = (await MockERC20.deploy(
      utils.parseEther("1000000000")
    )) as MockERC20;
    underlying = ustToken;

    const MockEthAnchorRouterFactory = await ethers.getContractFactory(
      "MockEthAnchorRouter"
    );
    mockEthAnchorRouter = (await MockEthAnchorRouterFactory.deploy(
      ustToken.address,
      aUstToken.address
    )) as MockEthAnchorRouter;

    const MockExchangeRateFeederFactory = await ethers.getContractFactory(
      "MockExchangeRateFeeder"
    );
    mockExchangeRateFeeder =
      (await MockExchangeRateFeederFactory.deploy()) as MockExchangeRateFeeder;

    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = (await VaultFactory.deploy(
      underlying.address,
      0,
      INVEST_PCT,
      owner.address
    )) as Vault;

    const USTStrategyFactory = await ethers.getContractFactory("USTStrategy");

    strategy = (await USTStrategyFactory.deploy(
      vault.address,
      TREASURY,
      mockEthAnchorRouter.address,
      mockExchangeRateFeeder.address,
      ustToken.address,
      aUstToken.address,
      PERFORMANCE_FEE_PCT,
      owner.address
    )) as USTStrategy;

    await strategy.connect(owner).grantRole(MANAGER_ROLE, manager.address);

    await vault.setStrategy(strategy.address);
  });

  describe("codearena issues", () => {
    it("issue #61 - no zero-address check on _treasury", async () => {
      const USTStrategyFactory = await ethers.getContractFactory("USTStrategy");

      const tx = USTStrategyFactory.deploy(
        vault.address,
        ethers.constants.AddressZero,
        mockEthAnchorRouter.address,
        mockExchangeRateFeeder.address,
        ustToken.address,
        aUstToken.address,
        PERFORMANCE_FEE_PCT,
        owner.address
      );

      await expect(tx).to.be.revertedWith("0 addr: _treasury");
    });

    it("issue #61 - no ERC165-check for _vault", async () => {
      const USTStrategyFactory = await ethers.getContractFactory("USTStrategy");

      const tx = USTStrategyFactory.deploy(
        TREASURY,
        TREASURY,
        mockEthAnchorRouter.address,
        mockExchangeRateFeeder.address,
        ustToken.address,
        aUstToken.address,
        PERFORMANCE_FEE_PCT,
        owner.address
      );

      await expect(tx).to.be.revertedWith("_vault: not an IVault");
    });
  });

  describe("#doHardWork function", () => {
    it("Revert if msg.sender is not manager", async () => {
      await expect(strategy.connect(alice).doHardWork()).to.be.revertedWith(
        "BaseStrategy: caller is not manager"
      );
    });

    it("Revert if underlying balance is zero", async () => {
      await expect(strategy.connect(manager).doHardWork()).to.be.revertedWith(
        "balance 0"
      );
    });

    it("Should deposit all underlying", async () => {
      const operator = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator);

      let underlyingBalance = utils.parseUnits("100", 18);
      await underlying
        .connect(owner)
        .transfer(vault.address, underlyingBalance);
      expect(await vault.totalUnderlying()).equal(underlyingBalance);
      await vault.connect(owner).updateInvested();
      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await strategy.convertedUst()).equal(0);
      expect(await strategy.pendingDeposits()).equal(underlyingBalance);
      expect(await strategy.investedAssets()).equal(underlyingBalance);
      const operation = await strategy.depositOperations(0);
      expect(operation.operator).equal(operator);
      expect(operation.amount).equal(underlyingBalance);
      expect(await strategy.depositOperationLength()).equal(1);
    });

    it("Should be able to deposit several times", async () => {
      const operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);

      let underlyingBalance0 = utils.parseUnits("100", 18);
      await underlying
        .connect(owner)
        .transfer(strategy.address, underlyingBalance0);
      await strategy.connect(manager).doHardWork();

      const operator1 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator1);
      let underlyingBalance1 = utils.parseUnits("50", 18);
      await underlying
        .connect(owner)
        .transfer(strategy.address, underlyingBalance1);
      await strategy.connect(manager).doHardWork();

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await strategy.convertedUst()).equal(0);
      expect(await strategy.pendingDeposits()).equal(
        underlyingBalance0.add(underlyingBalance1)
      );
      expect(await strategy.investedAssets()).equal(
        underlyingBalance0.add(underlyingBalance1)
      );
      const operation0 = await strategy.depositOperations(0);
      expect(operation0.operator).equal(operator0);
      expect(operation0.amount).equal(underlyingBalance0);

      const operation1 = await strategy.depositOperations(1);
      expect(operation1.operator).equal(operator1);
      expect(operation1.amount).equal(underlyingBalance1);
      expect(await strategy.depositOperationLength()).equal(2);
    });
  });

  describe("#finishDepositStable function", () => {
    let operator0: string;
    let amount0: BigNumber;
    let aUstAmount0: BigNumber;

    beforeEach(async () => {
      operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);

      amount0 = utils.parseUnits("100", 18);
      aUstAmount0 = utils.parseUnits("90", 18);
      await underlying.connect(owner).transfer(vault.address, amount0);
      await vault.connect(owner).updateInvested();
    });

    it("Revert if msg.sender is not manager", async () => {
      await expect(
        strategy.connect(alice).finishDepositStable(0)
      ).to.be.revertedWith("BaseStrategy: caller is not manager");
    });

    it("Revert if idx is out of array", async () => {
      await expect(
        strategy.connect(manager).finishDepositStable(1)
      ).to.be.revertedWith("not running");
    });

    it("Should finish deposit", async () => {
      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      await aUstToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, aUstAmount0);
      await mockEthAnchorRouter.notifyDepositResult(operator0, aUstAmount0);
      await strategy.connect(manager).finishDepositStable(0);

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await aUstToken.balanceOf(strategy.address)).equal(aUstAmount0);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0.mul(exchangeRate).div(utils.parseEther("1"))
      );

      expect(await strategy.convertedUst()).equal(amount0);
      expect(await strategy.pendingDeposits()).equal(0);
      expect(await strategy.depositOperationLength()).equal(0);
    });

    it("Should pop finished operation", async () => {
      const operator1 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator1);

      const amount1 = utils.parseUnits("50", 18);
      await underlying.connect(owner).transfer(vault.address, amount1);
      await vault.connect(owner).updateInvested();

      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      await aUstToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, aUstAmount0);
      await mockEthAnchorRouter.notifyDepositResult(operator0, aUstAmount0);
      await strategy.connect(manager).finishDepositStable(0);

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await aUstToken.balanceOf(strategy.address)).equal(aUstAmount0);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0.mul(exchangeRate).div(utils.parseEther("1")).add(amount1)
      );

      expect(await strategy.convertedUst()).equal(amount0);
      expect(await strategy.pendingDeposits()).equal(amount1);
      expect(await strategy.depositOperationLength()).equal(1);

      const operation0 = await strategy.depositOperations(0);
      expect(operation0.operator).equal(operator1);
      expect(operation0.amount).equal(amount1);
    });
  });

  describe("#initRedeemStable function", () => {
    let amount0: BigNumber;
    let aUstAmount0: BigNumber;

    beforeEach(async () => {
      const operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);

      amount0 = utils.parseUnits("100", 18);
      aUstAmount0 = utils.parseUnits("90", 18);
      await underlying.connect(owner).transfer(vault.address, amount0);
      await vault.connect(owner).updateInvested();

      await aUstToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, aUstAmount0);
      await mockEthAnchorRouter.notifyDepositResult(operator0, aUstAmount0);
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
      ).to.be.revertedWith("amount 0");
    });

    it("Revert if aUst balance is less than amount", async () => {
      await expect(
        strategy.connect(manager).initRedeemStable(utils.parseUnits("91", 18))
      ).to.be.revertedWith("insufficient");
    });

    it("Should init redeem operation", async () => {
      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      const operator = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator);

      const redeemAmount = utils.parseUnits("50", 18);
      await strategy.connect(manager).initRedeemStable(redeemAmount);
      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await aUstToken.balanceOf(strategy.address)).equal(
        aUstAmount0.sub(redeemAmount)
      );
      expect(await strategy.pendingRedeems()).equal(redeemAmount);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0.mul(exchangeRate).div(utils.parseEther("1"))
      );
      const operation = await strategy.redeemOperations(0);
      expect(operation.operator).equal(operator);
      expect(operation.amount).equal(redeemAmount);
      expect(await strategy.redeemOperationLength()).equal(1);
    });

    it("Should be able to init redeem several times", async () => {
      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      const operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);
      const redeemAmount0 = utils.parseUnits("50", 18);
      await strategy.connect(manager).initRedeemStable(redeemAmount0);

      const operator1 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator1);
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
        aUstAmount0.mul(exchangeRate).div(utils.parseEther("1"))
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
    let amount0: BigNumber;
    let aUstAmount0: BigNumber;
    let redeemAmount0: BigNumber;

    beforeEach(async () => {
      operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);

      amount0 = utils.parseUnits("100", 18);
      aUstAmount0 = utils.parseUnits("90", 18);
      await underlying.connect(owner).transfer(vault.address, amount0);
      await vault.connect(owner).updateInvested();

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

    it("Should finish redeem operation", async () => {
      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      let redeemedAmount0 = utils.parseUnits("40", 18);
      await ustToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, redeemedAmount0);
      await mockEthAnchorRouter.notifyRedeemResult(operator0, redeemedAmount0);

      await strategy.connect(manager).finishRedeemStable(0);

      expect(await aUstToken.balanceOf(strategy.address)).equal(
        aUstAmount0.sub(redeemAmount0)
      );
      expect(await strategy.pendingRedeems()).equal(0);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0
          .sub(redeemAmount0)
          .mul(exchangeRate)
          .div(utils.parseEther("1"))
      );

      expect(await strategy.redeemOperationLength()).equal(0);
    });

    it("Should pop finished operation", async () => {
      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      let redeemedAmount0 = utils.parseUnits("40", 18);
      await ustToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, redeemedAmount0);
      await mockEthAnchorRouter.notifyRedeemResult(operator0, redeemedAmount0);

      let redeemAmount1 = utils.parseUnits("10", 18);
      const operator1 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator1);
      await strategy.connect(manager).initRedeemStable(redeemAmount1);

      await strategy.connect(manager).finishRedeemStable(0);

      expect(await aUstToken.balanceOf(strategy.address)).equal(
        aUstAmount0.sub(redeemAmount0).sub(redeemAmount1)
      );
      expect(await strategy.pendingRedeems()).equal(redeemAmount1);
      expect(await strategy.investedAssets()).equal(
        aUstAmount0
          .sub(redeemAmount0)
          .mul(exchangeRate)
          .div(utils.parseEther("1"))
      );

      expect(await strategy.redeemOperationLength()).equal(1);
      const operation = await strategy.redeemOperations(0);
      expect(operation.operator).equal(operator1);
      expect(operation.amount).equal(redeemAmount1);
    });

    it("Should send performace fee if there is yield", async () => {
      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      let redeemedAmount0 = utils.parseUnits("60", 18);
      await ustToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, redeemedAmount0);
      await mockEthAnchorRouter.notifyRedeemResult(operator0, redeemedAmount0);

      const tx = await strategy.connect(manager).finishRedeemStable(0);
      const yieldAmount = redeemedAmount0.sub(
        amount0.mul(redeemAmount0).div(aUstAmount0)
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
          .mul(exchangeRate)
          .div(utils.parseEther("1"))
      );

      expect(await strategy.redeemOperationLength()).equal(0);
    });

    it("moves the funds to the vault", async () => {
      const exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      const redeemedAmount = utils.parseUnits("60", 18);
      await ustToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, redeemedAmount);

      await mockEthAnchorRouter.notifyRedeemResult(operator0, redeemedAmount);

      await strategy.connect(manager).finishRedeemStable(0);

      const yieldAmount = redeemedAmount.sub(
        amount0.mul(redeemAmount0).div(aUstAmount0)
      );
      const perfFee = yieldAmount.mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR);

      expect(await ustToken.connect(owner).balanceOf(vault.address)).to.eq(
        redeemedAmount.sub(perfFee)
      );
    });
  });

  describe("#withdrawAllToVault function", () => {
    const amount0 = utils.parseUnits("100", 18);
    const aUstAmount0 = utils.parseUnits("90", 18);
    const amount1 = utils.parseUnits("30", 18);

    beforeEach(async () => {
      const operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);

      await underlying.connect(owner).transfer(vault.address, amount0);
      await vault.connect(owner).updateInvested();

      await aUstToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, aUstAmount0);
      await mockEthAnchorRouter.notifyDepositResult(operator0, aUstAmount0);
      await strategy.connect(manager).finishDepositStable(0);

      await underlying.connect(owner).transfer(vault.address, amount1);
    });

    it("Revert if msg.sender is not manager", async () => {
      await expect(
        strategy.connect(alice).withdrawAllToVault()
      ).to.be.revertedWith("BaseStrategy: caller is not manager");
    });

    it("Should init redeem aUST and withdraw underlying to vault", async () => {
      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      const operator = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator);

      await strategy.connect(manager).withdrawAllToVault();

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await underlying.balanceOf(vault.address)).equal(amount1);
      expect(await aUstToken.balanceOf(strategy.address)).equal(0);
      expect(await strategy.pendingRedeems()).equal(aUstAmount0);

      const operation = await strategy.redeemOperations(0);
      expect(operation.operator).equal(operator);
      expect(operation.amount).equal(aUstAmount0);
      expect(await strategy.redeemOperationLength()).equal(1);
    });
  });

  describe("#withdrawToVault function", () => {
    const amount0 = utils.parseUnits("100", 18);
    const aUstAmount0 = utils.parseUnits("90", 18);
    const amount1 = utils.parseUnits("30", 18);
    const withdrawAmount = utils.parseUnits("20", 18);

    beforeEach(async () => {
      const operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);

      await underlying.connect(owner).transfer(vault.address, amount0);
      await vault.connect(owner).updateInvested();

      await aUstToken
        .connect(owner)
        .approve(mockEthAnchorRouter.address, aUstAmount0);
      await mockEthAnchorRouter.notifyDepositResult(operator0, aUstAmount0);
      await strategy.connect(manager).finishDepositStable(0);
    });

    it("Revert if msg.sender is not manager", async () => {
      await expect(
        strategy.connect(alice).withdrawToVault(withdrawAmount)
      ).to.be.revertedWith("BaseStrategy: caller is not manager");
    });

    it("Should withdraw underlying to vault", async () => {
      let exchangeRate = amount0.mul(utils.parseEther("1")).div(aUstAmount0);
      await mockExchangeRateFeeder.setExchangeRate(exchangeRate);

      const operator = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator);

      await underlying.connect(owner).transfer(strategy.address, amount1);
      await strategy.connect(manager).withdrawToVault(withdrawAmount);

      expect(await underlying.balanceOf(strategy.address)).equal(
        amount1.sub(withdrawAmount)
      );
      expect(await underlying.balanceOf(vault.address)).equal(withdrawAmount);
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
      ).to.be.revertedWith("invalid pct");
    });

    it("Should set invest percentage all by owner", async () => {
      expect(await strategy.perfFeePct()).equal(PERFORMANCE_FEE_PCT);
      let tx = await strategy.connect(owner).setPerfFeePct("100");
      expect(tx).to.emit(strategy, "PerfFeePctUpdated").withArgs("100");
      expect(await strategy.perfFeePct()).equal(100);
    });
  });

  describe("#setExchangeRateFeeder function", () => {
    it("Revert if msg.sender is not admin", async () => {
      await expect(
        strategy.connect(alice).setExchangeRateFeeder(generateNewAddress())
      ).to.be.revertedWith("BaseStrategy: caller is not admin");
    });

    it("Revert if address is zero", async () => {
      await expect(
        strategy.connect(owner).setExchangeRateFeeder(constants.AddressZero)
      ).to.be.revertedWith("0x addr");
    });

    it("Should update new exchange rate feeder", async () => {
      const newExchangeRateFeeder = generateNewAddress();
      const tx = await strategy
        .connect(owner)
        .setExchangeRateFeeder(newExchangeRateFeeder);

      expect(await strategy.exchangeRateFeeder()).equal(newExchangeRateFeeder);
      await expect(tx)
        .to.emit(strategy, "ExchangeRateFeederUpdated")
        .withArgs(newExchangeRateFeeder);
    });

    it("Should be able to deposit several times", async () => {
      const operator0 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator0);

      let underlyingBalance0 = utils.parseUnits("100", 18);
      await underlying
        .connect(owner)
        .transfer(strategy.address, underlyingBalance0);
      await strategy.connect(manager).doHardWork();

      const operator1 = generateNewAddress();
      await mockEthAnchorRouter.addPendingOperator(operator1);
      let underlyingBalance1 = utils.parseUnits("50", 18);
      await underlying
        .connect(owner)
        .transfer(strategy.address, underlyingBalance1);
      await strategy.connect(manager).doHardWork();

      expect(await underlying.balanceOf(strategy.address)).equal(0);
      expect(await strategy.convertedUst()).equal(0);
      expect(await strategy.pendingDeposits()).equal(
        underlyingBalance0.add(underlyingBalance1)
      );
      expect(await strategy.investedAssets()).equal(
        underlyingBalance0.add(underlyingBalance1)
      );
      const operation0 = await strategy.depositOperations(0);
      expect(operation0.operator).equal(operator0);
      expect(operation0.amount).equal(underlyingBalance0);

      const operation1 = await strategy.depositOperations(1);
      expect(operation1.operator).equal(operator1);
      expect(operation1.amount).equal(underlyingBalance1);
      expect(await strategy.depositOperationLength()).equal(2);
    });
  });
});
