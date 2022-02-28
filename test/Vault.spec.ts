import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { time } from "@openzeppelin/test-helpers";
import { Contract, utils, BigNumber, constants } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";

import {
  Vault,
  MockERC20,
  Depositors,
  Claimers,
  AnchorUSTStrategy,
  Vault__factory,
  Claimers__factory,
  Depositors__factory,
} from "../typechain";

import { depositParams, claimParams } from "./shared/factories";
import {
  getLastBlockTimestamp,
  moveForwardTwoWeeks,
  SHARES_MULTIPLIER,
  generateNewAddress,
  getRoleErrorMsg,
  arrayFromTo,
} from "./shared";

const { parseUnits } = ethers.utils;

describe("Vault", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let mockEthAnchorRouter: Contract;
  let mockAUstUstFeed: Contract;

  let underlying: MockERC20;
  let aUstToken: Contract;
  let vault: Vault;
  let depositors: Depositors;
  let claimers: Claimers;
  let strategy: AnchorUSTStrategy;
  const TWO_WEEKS = BigNumber.from(time.duration.days(14).toNumber());
  const TREASURY = generateNewAddress();
  const PERFORMANCE_FEE_PCT = BigNumber.from("200");
  const INVEST_PCT = BigNumber.from("9000");
  const DENOMINATOR = BigNumber.from("10000");

  const DEFAULT_ADMIN_ROLE = constants.HashZero;
  const INVESTOR_ROLE = utils.keccak256(utils.toUtf8Bytes("INVESTOR_ROLE"));
  const HARVESTOR_ROLE = utils.keccak256(utils.toUtf8Bytes("HARVESTOR_ROLE"));

  beforeEach(async () => {
    [owner, alice, bob, carol] = await ethers.getSigners();

    let MockERC20 = await ethers.getContractFactory("MockERC20");
    let Vault = await ethers.getContractFactory("Vault");
    let MockStrategy = await ethers.getContractFactory("MockStrategy");

    underlying = await MockERC20.deploy(utils.parseEther("1000000000"));
    aUstToken = await MockERC20.deploy(utils.parseEther("1000000000"));

    const MockEthAnchorRouterFactory = await ethers.getContractFactory(
      "MockEthAnchorRouter"
    );
    mockEthAnchorRouter = await MockEthAnchorRouterFactory.deploy(
      underlying.address,
      aUstToken.address
    );

    const MockChainlinkPriceFeedFactory = await ethers.getContractFactory(
      "MockChainlinkPriceFeed"
    );
    mockAUstUstFeed = await MockChainlinkPriceFeedFactory.deploy(18);

    vault = await Vault.deploy(
      underlying.address,
      TWO_WEEKS,
      INVEST_PCT,
      TREASURY,
      owner.address,
      PERFORMANCE_FEE_PCT
    );

    strategy = await MockStrategy.deploy(
      vault.address,
      mockEthAnchorRouter.address,
      mockAUstUstFeed.address,
      underlying.address,
      aUstToken.address
    );

    depositors = Depositors__factory.connect(await vault.depositors(), owner);
    claimers = Claimers__factory.connect(await vault.claimers(), owner);
  });

  describe("codearena", () => {
    describe("issue #125", () => {
      beforeEach(async () => {
        await addUnderlyingBalance(alice, "1000");

        await vault.connect(alice).deposit(
          depositParams.build({
            amount: parseUnits("1000"),
            claims: arrayFromTo(1, 100).map(() =>
              claimParams.percent(1).to(bob.address).build()
            ),
          })
        );

        await moveForwardTwoWeeks();
      });

      it("works with a single withdraw", async () => {
        await vault.connect(alice).withdraw(alice.address, arrayFromTo(0, 98));

        expect(await underlying.balanceOf(alice.address)).to.eq(
          parseUnits("990")
        );

        expect(await vault.sharesOf(1)).to.eq(
          parseUnits("10").mul(SHARES_MULTIPLIER)
        );
      });

      it("works with multiple withdraws", async () => {
        await Promise.all(
          arrayFromTo(0, 98).map((i) =>
            vault.connect(alice).withdraw(alice.address, [i])
          )
        );

        expect(await underlying.balanceOf(alice.address)).to.eq(
          parseUnits("990")
        );
        expect(await vault.sharesOf(1)).to.eq(
          parseUnits("10").mul(SHARES_MULTIPLIER)
        );
      });
    });

    describe("issue #52", () => {
      it("works with irregular amounts without losing precision", async () => {
        await addUnderlyingBalance(alice, "1000");

        await vault.connect(alice).deposit(
          depositParams.build({
            amount: 11,
            claims: [
              claimParams.percent(50).to(alice.address).build(),
              claimParams.percent(50).to(bob.address).build(),
            ],
          })
        );

        expect((await vault.deposits(0)).amount).to.equal(5);
        expect((await vault.deposits(1)).amount).to.equal(6);
      });
    });
  });

  describe("constructor", () => {
    let VaultFactory: Vault__factory;

    beforeEach(async () => {
      VaultFactory = await ethers.getContractFactory("Vault");
    });

    it("Revert if underlying is address(0)", async () => {
      await expect(
        VaultFactory.deploy(
          constants.AddressZero,
          TWO_WEEKS,
          INVEST_PCT,
          TREASURY,
          owner.address,
          PERFORMANCE_FEE_PCT
        )
      ).to.be.revertedWith("Vault: underlying cannot be 0x0");
    });

    it("Revert if min lock period is zero", async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          0,
          INVEST_PCT,
          TREASURY,
          owner.address,
          PERFORMANCE_FEE_PCT
        )
      ).to.be.revertedWith("Vault: minLockPeriod cannot be 0");
    });

    it("Revert if invest percentage is greater than 100%", async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          TWO_WEEKS,
          DENOMINATOR.add(BigNumber.from("1")),
          TREASURY,
          owner.address,
          PERFORMANCE_FEE_PCT
        )
      ).to.be.revertedWith("Vault: invalid investPerc");
    });

    it("Revert if performance fee percentage is greater than 100%", async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          TWO_WEEKS,
          INVEST_PCT,
          TREASURY,
          owner.address,
          DENOMINATOR.add(BigNumber.from("1"))
        )
      ).to.be.revertedWith("Vault: invalid performance fee");
    });

    it("Revert if treasury is address(0)", async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          TWO_WEEKS,
          INVEST_PCT,
          constants.AddressZero,
          owner.address,
          PERFORMANCE_FEE_PCT
        )
      ).to.be.revertedWith("Vault: treasury cannot be 0x0");
    });

    it("Revert if owner is address(0)", async () => {
      await expect(
        VaultFactory.deploy(
          underlying.address,
          TWO_WEEKS,
          INVEST_PCT,
          TREASURY,
          constants.AddressZero,
          PERFORMANCE_FEE_PCT
        )
      ).to.be.revertedWith("Vault: owner cannot be 0x0");
    });

    it("Check initial values", async () => {
      expect(
        await vault.hasRole(DEFAULT_ADMIN_ROLE, owner.address)
      ).to.be.equal(true);
      expect(await vault.hasRole(INVESTOR_ROLE, owner.address)).to.be.equal(
        true
      );
      expect(await vault.hasRole(HARVESTOR_ROLE, owner.address)).to.be.equal(
        true
      );

      expect(await vault.underlying()).to.be.equal(underlying.address);
      expect(await vault.minLockPeriod()).to.be.equal(TWO_WEEKS);
      expect(await vault.investPerc()).to.be.equal(INVEST_PCT);
      expect(await vault.treasury()).to.be.equal(TREASURY);
      expect(await vault.perfFeePct()).to.be.equal(PERFORMANCE_FEE_PCT);

      expect(await vault.depositors()).to.be.not.equal(constants.AddressZero);
      expect(await vault.claimers()).to.be.not.equal(constants.AddressZero);
    });
  });

  describe("#setTreasury function", () => {
    it("Revert if msg.sender is not admin", async () => {
      await expect(
        vault.connect(alice).setTreasury(TREASURY)
      ).to.be.revertedWith(getRoleErrorMsg(alice, DEFAULT_ADMIN_ROLE));
    });

    it("Revert if treasury is address(0)", async () => {
      await expect(
        vault.connect(owner).setTreasury(constants.AddressZero)
      ).to.be.revertedWith("Vault: treasury cannot be 0x0");
    });

    it("Should change treasury and emit TreasuryUpdated event", async () => {
      const newTreasury = generateNewAddress();
      const tx = await vault.connect(owner).setTreasury(newTreasury);

      await expect(tx).emit(vault, "TreasuryUpdated").withArgs(newTreasury);
      expect(await vault.treasury()).to.be.equal(newTreasury);
    });
  });

  describe("#setPerfFeePct function", () => {
    it("Revert if msg.sender is not admin", async () => {
      await expect(vault.connect(alice).setPerfFeePct(100)).to.be.revertedWith(
        getRoleErrorMsg(alice, DEFAULT_ADMIN_ROLE)
      );
    });

    it("Revert if performance fee percentage is greater than 100%", async () => {
      await expect(
        vault.connect(owner).setPerfFeePct(DENOMINATOR.add(BigNumber.from("1")))
      ).to.be.revertedWith("Vault: invalid performance fee");
    });

    it("Should change perfFeePct and emit PerfFeePctUpdated event", async () => {
      const newFeePct = 100;
      const tx = await vault.connect(owner).setPerfFeePct(newFeePct);

      await expect(tx).emit(vault, "PerfFeePctUpdated").withArgs(newFeePct);
      expect(await vault.perfFeePct()).to.be.equal(newFeePct);
    });
  });

  describe("#setInvestPerc function", () => {
    it("Revert if msg.sender is not admin", async () => {
      await expect(vault.connect(alice).setInvestPerc(100)).to.be.revertedWith(
        getRoleErrorMsg(alice, DEFAULT_ADMIN_ROLE)
      );
    });

    it("Revert if invest percentage is greater than 100%", async () => {
      await expect(
        vault.connect(owner).setInvestPerc(DENOMINATOR.add(BigNumber.from("1")))
      ).to.be.revertedWith("Vault: invalid investPerc");
    });

    it("Should change perfFeePct and emit PerfFeePctUpdated event", async () => {
      const newInvestPct = 8000;
      const tx = await vault.connect(owner).setInvestPerc(newInvestPct);

      await expect(tx)
        .emit(vault, "InvestPercentageUpdated")
        .withArgs(newInvestPct);
      expect(await vault.investPerc()).to.be.equal(newInvestPct);
    });
  });

  describe("#harvest function", () => {
    let perfFee: BigNumber;

    beforeEach(async () => {
      await addUnderlyingBalance(alice, "1000");

      const amount = parseUnits("100");
      const params = depositParams.build({
        amount,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      await vault.connect(alice).deposit(params);
      const newYield = await addYieldToVault("100");
      perfFee = newYield.mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR);
    });

    it("Revert if msg.sender is not harvestor", async () => {
      await expect(vault.connect(alice).harvest()).to.be.revertedWith(
        getRoleErrorMsg(alice, HARVESTOR_ROLE)
      );
    });

    it("Should harvest performance fee and emit FeeHarvested event", async () => {
      const tx = await vault.connect(owner).harvest();

      expect(await underlying.balanceOf(TREASURY)).to.be.equal(perfFee);
      await expect(tx).to.emit(vault, "FeeHarvested").withArgs(perfFee);

      expect(await vault.perfFee()).to.be.eq("0");
      expect(await vault.totalDebt()).to.be.eq(await vault.totalUnderlying());
    });

    it("Revert if nothing to harvest", async () => {
      await vault.connect(owner).harvest();

      await expect(vault.connect(owner).harvest()).to.be.revertedWith(
        "Vault: no performance fee"
      );
    });
  });

  describe("updateInvested", () => {
    it("moves the funds to the strategy", async () => {
      await vault.connect(owner).setStrategy(strategy.address);
      await vault.connect(owner).setInvestPerc("8000");
      await addYieldToVault("100");

      await vault.connect(owner).updateInvested("0x");

      expect(await underlying.balanceOf(strategy.address)).to.eq(
        parseUnits("80")
      );
    });
  });

  describe("investableAmount", () => {
    it("returns the amount available to invest", async () => {
      await vault.connect(owner).setStrategy(strategy.address);
      await addYieldToVault("100");

      expect(await vault.investableAmount()).to.equal(parseUnits("90"));
    });

    it("takes into account the invested amount", async () => {
      await vault.connect(owner).setStrategy(strategy.address);
      await vault.connect(owner).setInvestPerc("9000");
      await addYieldToVault("100");
      await underlying.mint(strategy.address, parseUnits("100"));

      expect(await vault.investableAmount()).to.equal(parseUnits("80"));
    });
  });

  describe("setStrategy", () => {
    it("changes the strategy", async () => {
      expect(await vault.strategy()).to.equal(
        "0x0000000000000000000000000000000000000000"
      );

      await vault.connect(owner).setStrategy(strategy.address);

      expect(await vault.strategy()).to.equal(strategy.address);
    });

    it("emits an event", async () => {
      expect(await vault.strategy()).to.equal(
        "0x0000000000000000000000000000000000000000"
      );

      const tx = vault.connect(owner).setStrategy(strategy.address);

      await expect(tx)
        .to.emit(vault, "StrategyUpdated")
        .withArgs(strategy.address);
    });
  });

  describe("sponsor", () => {
    it("adds a sponsor to the vault", async () => {
      await addUnderlyingBalance(alice, "1000");

      await vault.connect(alice).sponsor(parseUnits("500"), TWO_WEEKS);
      await vault.connect(alice).sponsor(parseUnits("500"), TWO_WEEKS);

      expect(await vault.totalSponsored()).to.eq(parseUnits("1000"));
    });

    it("emits an event", async () => {
      await addUnderlyingBalance(alice, "1000");

      const tx = await vault
        .connect(alice)
        .sponsor(parseUnits("500"), TWO_WEEKS);

      await expect(tx)
        .to.emit(vault, "Sponsored")
        .withArgs(
          0,
          parseUnits("500"),
          alice.address,
          TWO_WEEKS.add(await getLastBlockTimestamp())
        );
    });

    it("fails if the lock duration 0", async () => {
      await addUnderlyingBalance(alice, "1000");

      await expect(
        vault.connect(alice).sponsor(parseUnits("500"), 0)
      ).to.be.revertedWith("Vault: invalid lock period");
    });

    it("fails if the lock duration is less than the minimum", async () => {
      await addUnderlyingBalance(alice, "1000");
      const lockDuration = 1;

      await expect(
        vault.connect(alice).sponsor(parseUnits("500"), lockDuration)
      ).to.be.revertedWith("Vault: invalid lock period");
    });

    it("fails if the lock duration is larger than the maximum", async () => {
      await addUnderlyingBalance(alice, "1000");
      const lockDuration = BigNumber.from(time.duration.years(100).toNumber());

      await expect(
        vault.connect(alice).sponsor(parseUnits("500"), lockDuration)
      ).to.be.revertedWith("Vault: invalid lock period");
    });

    it("fails if the sponsor amount is 0", async () => {
      await addUnderlyingBalance(alice, "1000");
      const lockDuration = BigNumber.from(time.duration.days(15).toNumber());

      await expect(
        vault.connect(alice).sponsor(parseUnits("0"), lockDuration)
      ).to.be.revertedWith("Vault: cannot sponsor 0");
    });
  });

  describe("unsponsor", () => {
    it("removes a sponsor from the vault", async () => {
      await addUnderlyingBalance(alice, "1000");
      await vault.connect(alice).sponsor(parseUnits("500"), TWO_WEEKS);
      await vault.connect(alice).sponsor(parseUnits("500"), TWO_WEEKS);

      await moveForwardTwoWeeks();
      await vault.connect(alice)["unsponsor"](bob.address, [0]);

      expect(await vault.totalSponsored()).to.eq(parseUnits("500"));
      expect(await underlying.balanceOf(bob.address)).to.eq(parseUnits("500"));
    });

    it("emits an event", async () => {
      await addUnderlyingBalance(alice, "1000");
      await vault.connect(alice).sponsor(parseUnits("500"), TWO_WEEKS);

      await moveForwardTwoWeeks();
      const tx = await vault.connect(alice)["unsponsor"](bob.address, [0]);

      await expect(tx).to.emit(vault, "Unsponsored").withArgs(0);
    });

    it("fails if the caller is not the owner", async () => {
      await addUnderlyingBalance(alice, "1000");
      await vault.connect(alice).sponsor(parseUnits("500"), TWO_WEEKS);

      await expect(
        vault.connect(bob)["unsponsor"](alice.address, [0])
      ).to.be.revertedWith("Vault: you are not allowed");
    });

    it("fails if the destination address is 0x", async () => {
      await addUnderlyingBalance(alice, "1000");
      await vault.connect(alice).sponsor(parseUnits("500"), TWO_WEEKS);

      await expect(
        vault
          .connect(bob)
          ["unsponsor"]("0x0000000000000000000000000000000000000000", [0])
      ).to.be.revertedWith("Vault: destination address is 0x");
    });

    it("fails if the amount is still locked", async () => {
      await addUnderlyingBalance(alice, "1000");
      await vault.connect(alice).sponsor(parseUnits("500"), TWO_WEEKS);

      await expect(
        vault.connect(alice)["unsponsor"](alice.address, [0])
      ).to.be.revertedWith("Vault: amount is locked");
    });

    it("fails if token id belongs to a withdraw", async () => {
      await addUnderlyingBalance(alice, "1000");

      await vault.connect(alice).deposit(
        depositParams.build({
          lockDuration: TWO_WEEKS,
          amount: parseUnits("500"),
          claims: [claimParams.percent(100).to(alice.address).build()],
        })
      );
      await vault.connect(alice).sponsor(parseUnits("500"), TWO_WEEKS);

      await moveForwardTwoWeeks();

      await expect(
        vault.connect(alice)["unsponsor"](alice.address, [0, 1])
      ).to.be.revertedWith("Vault: token id is not a sponsor");
    });

    it("fails if there are not enough funds", async () => {
      await addUnderlyingBalance(alice, "1000");
      await vault.connect(alice).sponsor(parseUnits("1000"), TWO_WEEKS);
      await moveForwardTwoWeeks();

      await removeUnderlyingFromVault("500");

      await expect(
        vault.connect(alice).unsponsor(alice.address, [0])
      ).to.be.revertedWith("Vault: not enough funds");
    });
  });

  describe("deposit", () => {
    it("emits events", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        lockDuration: TWO_WEEKS,
        amount: parseUnits("100"),
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams
            .percent(50)
            .data(ethers.utils.hexlify(123))
            .to(bob.address)
            .build(),
        ],
      });

      const tx = await vault.connect(alice).deposit(params);

      await expect(tx)
        .to.emit(vault, "DepositMinted")
        .withArgs(
          0,
          0,
          parseUnits("50"),
          parseUnits("50").mul(SHARES_MULTIPLIER),
          alice.address,
          carol.address,
          1,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
          "0x00"
        );

      await expect(tx)
        .to.emit(vault, "DepositMinted")
        .withArgs(
          1,
          0,
          parseUnits("50"),
          parseUnits("50").mul(SHARES_MULTIPLIER),
          alice.address,
          bob.address,
          2,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
          ethers.utils.hexlify(123)
        );
    });

    it("emits events with a different groupId per deposit", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        lockDuration: TWO_WEEKS,
        amount: parseUnits("100"),
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
      const tx = await vault.connect(alice).deposit(params);

      await expect(tx)
        .to.emit(vault, "DepositMinted")
        .withArgs(
          2,
          1,
          parseUnits("50"),
          parseUnits("50").mul(SHARES_MULTIPLIER),
          alice.address,
          carol.address,
          1,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
          "0x00"
        );

      await expect(tx)
        .to.emit(vault, "DepositMinted")
        .withArgs(
          3,
          1,
          parseUnits("50"),
          parseUnits("50").mul(SHARES_MULTIPLIER),
          alice.address,
          bob.address,
          2,
          TWO_WEEKS.add(await getLastBlockTimestamp()),
          "0x00"
        );
    });

    it("sets a timelock of at least 2 weeks by default", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        amount: parseUnits("100"),
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);

      const deposit = await vault.deposits(0);

      expect(deposit.lockedUntil.toNumber()).to.be.at.least(
        TWO_WEEKS.add(await getLastBlockTimestamp())
      );
    });

    it("fails if the timelock is less than 2 weeks", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        amount: parseUnits("100"),
        lockDuration: BigNumber.from(time.duration.days(13).toNumber()),
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      const action = vault.connect(alice).deposit(params);

      await expect(action).to.be.revertedWith("Vault: invalid lock period");
    });

    it("fails if the claim percentage is 0", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        amount: parseUnits("100"),
        claims: [
          claimParams.percent(100).to(bob.address).build(),
          claimParams.percent(0).to(bob.address).build(),
        ],
      });

      const action = vault.connect(alice).deposit(params);

      await expect(action).to.be.revertedWith(
        "Vault: claim percentage cannot be 0"
      );
    });

    it("fails if the amount is 0", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        amount: parseUnits("0"),
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      const action = vault.connect(alice).deposit(params);

      await expect(action).to.be.revertedWith("Vault: cannot deposit 0");
    });
  });

  ["withdraw", "forceWithdraw"].map((vaultAction) => {
    describe(vaultAction, () => {
      it("emits events", async () => {
        await addUnderlyingBalance(alice, "1000");

        const params = depositParams.build({
          amount: parseUnits("100"),
          claims: [
            claimParams.percent(50).to(carol.address).build(),
            claimParams.percent(50).to(bob.address).build(),
          ],
        });

        await vault.connect(alice).deposit(params);

        await moveForwardTwoWeeks();
        const tx = await vault
          .connect(alice)
          [vaultAction](alice.address, [0, 1]);

        await expect(tx)
          .to.emit(vault, "DepositBurned")
          .withArgs(0, parseUnits("50").mul(SHARES_MULTIPLIER), alice.address);
        await expect(tx)
          .to.emit(vault, "DepositBurned")
          .withArgs(1, parseUnits("50").mul(SHARES_MULTIPLIER), alice.address);
      });

      it("withdraws the principal of a deposit", async () => {
        await addUnderlyingBalance(alice, "1000");

        const params = depositParams.build({
          amount: parseUnits("100"),
          claims: [
            claimParams.percent(50).to(carol.address).build(),
            claimParams.percent(50).to(bob.address).build(),
          ],
        });

        await vault.connect(alice).deposit(params);

        expect(await underlying.balanceOf(alice.address)).to.eq(
          parseUnits("900")
        );

        await moveForwardTwoWeeks();
        await vault.connect(alice)[vaultAction](alice.address, [0, 1]);

        expect(await underlying.balanceOf(alice.address)).to.eq(
          parseUnits("1000")
        );
      });

      it("withdraws funds to a different address", async () => {
        await addUnderlyingBalance(alice, "1000");

        const params = depositParams.build({
          amount: parseUnits("100"),
          claims: [claimParams.percent(100).to(bob.address).build()],
        });

        await vault.connect(alice).deposit(params);
        await moveForwardTwoWeeks();
        await vault.connect(alice)[vaultAction](carol.address, [0]);

        expect(await underlying.balanceOf(carol.address)).to.eq(
          parseUnits("100")
        );
      });

      it("burns the NFTs of the deposits", async () => {
        await addUnderlyingBalance(alice, "1000");

        const params = depositParams.build({
          amount: parseUnits("100"),
          claims: [
            claimParams.percent(50).to(carol.address).build(),
            claimParams.percent(50).to(bob.address).build(),
          ],
        });

        await vault.connect(alice).deposit(params);
        await moveForwardTwoWeeks();
        await vault.connect(alice)[vaultAction](alice.address, [1, 0]);

        expect(await depositors.exists(1)).to.false;
        expect(await depositors.exists(2)).to.false;
      });

      it("removes the shares from the claimers", async () => {
        await addUnderlyingBalance(alice, "1000");

        const params = depositParams.build({
          amount: parseUnits("100"),
          claims: [
            claimParams.percent(50).to(carol.address).build(),
            claimParams.percent(50).to(bob.address).build(),
          ],
        });

        await vault.connect(alice).deposit(params);

        expect(await vault.sharesOf(1)).to.eq(
          parseUnits("50").mul(SHARES_MULTIPLIER)
        );
        expect(await vault.sharesOf(2)).to.eq(
          parseUnits("50").mul(SHARES_MULTIPLIER)
        );

        await moveForwardTwoWeeks();
        await vault.connect(alice)[vaultAction](alice.address, [0]);

        expect(await vault.sharesOf(1)).to.eq(0);
        expect(await vault.sharesOf(2)).to.eq(
          parseUnits("50").mul(SHARES_MULTIPLIER)
        );
      });

      it("fails if the destination address is 0x", async () => {
        await addUnderlyingBalance(alice, "1000");
        await addUnderlyingBalance(bob, "1000");

        const params = depositParams.build({
          amount: parseUnits("100"),
          claims: [claimParams.percent(100).to(carol.address).build()],
        });

        await vault.connect(alice).deposit(params);
        await vault.connect(bob).deposit(params);

        await moveForwardTwoWeeks();
        const action = vault
          .connect(bob)
          [vaultAction]("0x0000000000000000000000000000000000000000", [0, 1]);

        await expect(action).to.be.revertedWith(
          "Vault: destination address is 0x"
        );
      });

      it("fails if the caller doesn't own the deposit", async () => {
        await addUnderlyingBalance(alice, "1000");
        await addUnderlyingBalance(bob, "1000");

        const params = depositParams.build({
          amount: parseUnits("100"),
          claims: [claimParams.percent(100).to(carol.address).build()],
        });

        await vault.connect(alice).deposit(params);
        await vault.connect(bob).deposit(params);

        await moveForwardTwoWeeks();
        const action = vault.connect(bob)[vaultAction](bob.address, [0, 1]);

        await expect(action).to.be.revertedWith(
          "Vault: you are not the owner of a deposit"
        );
      });

      it("fails if the deposit is locked", async () => {
        await addUnderlyingBalance(alice, "1000");

        const params = depositParams.build({
          lockDuration: TWO_WEEKS,
          amount: parseUnits("100"),
          claims: [claimParams.percent(100).to(bob.address).build()],
        });

        await vault.connect(alice).deposit(params);

        const action = vault.connect(alice)[vaultAction](alice.address, [0]);

        await expect(action).to.be.revertedWith("Vault: deposit is locked");
      });

      it("fails if token id belongs to a sponsor", async () => {
        await addUnderlyingBalance(alice, "1000");

        await vault.connect(alice).deposit(
          depositParams.build({
            lockDuration: TWO_WEEKS,
            amount: parseUnits("500"),
            claims: [claimParams.percent(100).to(alice.address).build()],
          })
        );
        await vault.connect(alice).sponsor(parseUnits("500"), TWO_WEEKS);

        await moveForwardTwoWeeks();

        await expect(
          vault.connect(alice)[vaultAction](alice.address, [0, 1])
        ).to.be.revertedWith("Vault: token id is not a deposit");
      });
    });
  });

  describe("forceWithdraw", () => {
    it("works if the vault doesn't have enough funds", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        amount: parseUnits("1000"),
        claims: [claimParams.percent(100).to(carol.address).build()],
      });

      await vault.connect(alice).deposit(params);
      await moveForwardTwoWeeks();
      await removeUnderlyingFromVault("500");

      await vault.connect(alice).forceWithdraw(alice.address, [0]);

      expect(await underlying.balanceOf(alice.address)).to.eq(
        parseUnits("500")
      );
    });
  });

  describe("withdraw", () => {
    it("fails if the vault doesn't have enough funds", async () => {
      await addUnderlyingBalance(alice, "100");

      const params = depositParams.build({
        amount: parseUnits("100"),
        claims: [claimParams.percent(100).to(carol.address).build()],
      });

      await vault.connect(alice).deposit(params);

      await moveForwardTwoWeeks();
      await removeUnderlyingFromVault("50");

      const action = vault.connect(alice).withdraw(alice.address, [0]);

      await expect(action).to.be.revertedWith(
        "Vault: cannot withdraw more than the available amount"
      );
    });
  });

  describe("claimYield", () => {
    it("claims the yield of a user", async () => {
      await addUnderlyingBalance(alice, "1000");

      const amount = parseUnits("100");
      const params = depositParams.build({
        amount,
        claims: [
          claimParams.percent(50).to(carol.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
      const newYield = await addYieldToVault("100");
      const perfFee = newYield.mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR);

      const carolYield = newYield.sub(perfFee).div(BigNumber.from("2"));
      expect(await vault.yieldFor(carol.address)).to.eq(carolYield);

      const totalShares = await vault.totalShares();
      const totalUnderlyingMinusFee = amount.add(newYield).sub(perfFee);
      const shares = totalShares.mul(carolYield).div(totalUnderlyingMinusFee);
      const shareAmount = totalUnderlyingMinusFee.mul(shares).div(totalShares);

      const tx = await vault.connect(carol).claimYield(carol.address);

      expect(await vault.yieldFor(carol.address)).to.eq(parseUnits("0"));
      expect(await underlying.balanceOf(carol.address)).to.eq(shareAmount);
      expect(await vault.yieldFor(bob.address)).to.eq(
        newYield.sub(perfFee).div(BigNumber.from("2"))
      );

      await expect(tx)
        .to.emit(vault, "YieldClaimed")
        .withArgs(1, carol.address, shareAmount, shares);
    });

    it("claims the yield to a different address", async () => {
      await addUnderlyingBalance(alice, "1000");

      const amount = parseUnits("100");
      const params = depositParams.build({
        amount,
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      await vault.connect(alice).deposit(params);
      const newYield = await addYieldToVault("100");
      const perfFee = newYield.mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR);

      const carolYield = newYield.sub(perfFee);
      const totalShares = await vault.totalShares();
      const totalUnderlyingMinusFee = amount.add(newYield).sub(perfFee);
      const shares = totalShares.mul(carolYield).div(totalUnderlyingMinusFee);
      const shareAmount = totalUnderlyingMinusFee.mul(shares).div(totalShares);

      await vault.connect(bob).claimYield(carol.address);

      expect(await underlying.balanceOf(carol.address)).to.eq(shareAmount);
    });

    it("fails is the destination address is 0x", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        amount: parseUnits("100"),
        claims: [claimParams.percent(100).to(bob.address).build()],
      });

      await vault.connect(alice).deposit(params);
      await addYieldToVault("100");

      await expect(
        vault
          .connect(bob)
          .claimYield("0x0000000000000000000000000000000000000000")
      ).to.be.revertedWith("Vault: destination address is 0x");
    });
  });

  describe("yieldFor", () => {
    it("returns the amount of yield claimable by a user", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        amount: parseUnits("100"),
        claims: [
          claimParams.percent(50).to(alice.address).build(),
          claimParams.percent(50).to(bob.address).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
      const newYield = await addYieldToVault("100");
      const perfFee = newYield.mul(PERFORMANCE_FEE_PCT).div(DENOMINATOR);

      expect(await vault.yieldFor(alice.address)).to.eq(
        newYield.sub(perfFee).div(BigNumber.from("2"))
      );
      expect(await vault.yieldFor(bob.address)).to.eq(
        newYield.sub(perfFee).div(BigNumber.from("2"))
      );
    });
  });

  describe("deposit", () => {
    it("fails if the yield is negative", async () => {
      await addUnderlyingBalance(alice, "2000");

      const params = depositParams.build({
        amount: parseUnits("1000"),
      });

      await vault.connect(alice).deposit(params);

      await removeUnderlyingFromVault("21");

      await expect(vault.connect(alice).deposit(params)).to.be.revertedWith(
        "Vault: cannot deposit when yield is negative"
      );
    });

    it("works if the negative yield is less than the strategy's estimated fees", async () => {
      await vault.setStrategy(strategy.address);

      await addUnderlyingBalance(alice, "2000");

      const params = depositParams.build({
        amount: parseUnits("1000"),
      });

      await vault.connect(alice).deposit(params);

      await removeUnderlyingFromVault("19");

      await vault.connect(alice).deposit(params);
    });

    it("works with valid parameters", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build();

      await vault.connect(alice).deposit(params);
    });

    it("works with multiple claims", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        claims: [
          claimParams.percent(50).build(),
          claimParams.percent(50).build(),
        ],
      });

      await vault.connect(alice).deposit(params);
    });

    it("calculates correct number of shares for first deposit", async () => {
      await addUnderlyingBalance(alice, "1000");

      const amount = parseUnits("1");
      const params = depositParams.build({ amount });

      await vault.connect(alice).deposit(params);

      expect(await vault.totalShares()).to.equal(amount.mul(SHARES_MULTIPLIER));
    });

    it("calculates correct number of shares for second deposit of equal size", async () => {
      await addUnderlyingBalance(alice, "1000");
      await addUnderlyingBalance(bob, "1000");

      const amount = parseUnits("1");
      const params = depositParams.build({ amount });

      // deposit 1 unit
      await vault.connect(alice).deposit(params);

      // deposit 1 unit
      await vault.connect(bob).deposit(params);

      // total shares must be 2 units
      expect(await vault.totalShares()).to.equal(
        amount.mul(2).mul(SHARES_MULTIPLIER)
      );
    });

    it("calculates correct number of shares for second deposit of different size", async () => {
      await addUnderlyingBalance(alice, "1000");
      await addUnderlyingBalance(bob, "1000");
      const amount = parseUnits("1");

      // deposit 1 unit
      const params1 = depositParams.build({ amount });
      await vault.connect(alice).deposit(params1);

      // deposit 2 unit
      const params2 = depositParams.build({ amount: amount.mul(2) });
      await vault.connect(bob).deposit(params2);

      // total shares must be 3 units
      expect(await vault.totalShares()).to.equal(
        amount.mul(3).mul(SHARES_MULTIPLIER)
      );
    });

    it("fails if pct does not add up to 100%", async () => {
      await addUnderlyingBalance(alice, "1000");

      const params = depositParams.build({
        claims: [
          claimParams.percent(49).build(),
          claimParams.percent(50).build(),
        ],
      });

      const action = vault.connect(alice).deposit(params);

      await expect(action).to.be.revertedWith(
        "Vault: claims don't add up to 100%"
      );
    });
  });

  async function addYieldToVault(amount: string) {
    await underlying.mint(vault.address, parseUnits(amount));
    return parseUnits(amount);
  }

  async function addUnderlyingBalance(
    account: SignerWithAddress,
    amount: string
  ) {
    await underlying.mint(account.address, parseUnits(amount));
    return underlying
      .connect(account)
      .approve(vault.address, parseUnits(amount));
  }

  function removeUnderlyingFromVault(amount: string) {
    return underlying.burn(vault.address, parseUnits(amount));
  }
});
