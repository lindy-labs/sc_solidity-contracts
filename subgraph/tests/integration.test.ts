import { log, ethereum, Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  test,
  assert,
  newMockEvent,
  clearStore,
} from "matchstick-as/assembly/index";

import {
  handleDepositMinted,
  handleSponsored,
  handleUnsponsored,
  handleDepositWithdrawn,
  handleYieldClaimed,
  handleTreasuryUpdated,
} from "../src/mappings/vault";
import {
  handleInitDeposit,
  handleInitRedeem,
  handleFinishDeposit,
  handleFinishRedeem,
  handleRearrangeDeposit,
  handleRearrangeRedeem,
} from "../src/mappings/strategy";
import { Sponsored, Unsponsored } from "../src/types/Vault/IVaultSponsoring";
import {
  DepositWithdrawn,
  DepositMinted,
  YieldClaimed,
} from "../src/types/Vault/IVault";
import { TreasuryUpdated } from "../src/types/Vault/IVaultSettings";
import {
  Vault,
  Deposit,
  Sponsor,
  Claimer,
  Foundation,
  DepositOperation,
  RedeemOperation,
} from "../src/types/schema";
import {
  FinishDepositStable,
  FinishRedeemStable,
  InitDepositStable,
  InitRedeemStable,
  RearrangeDepositOperation,
  RearrangeRedeemOperation,
} from "../src/types/Strategy/AnchorStrategy";

const MOCK_ADDRESS_1 =
  "0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd".toLowerCase();
const MOCK_ADDRESS_2 =
  "0xE80B3caAd6d2DE80Ac76a41d5F0072E36D2519Ce".toLowerCase();
const TREASURY_ADDRESS = "0x4940c6e628da11ac0bdcf7f82be8579b4696fa33";

test("handleInitDeposit creates a DepositOperation", () => {
  clearStore();

  let mockEvent = newMockEvent();
  const event = new InitDepositStable(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  const operator = newAddress("operator", MOCK_ADDRESS_1);
  const idx = newI32("idx", 1);
  const underlyingAmount = newI32("underlyingAmount", 1);
  const ustAmount = newI32("ustAmount", 1);

  event.parameters.push(operator);
  event.parameters.push(idx);
  event.parameters.push(ustAmount);
  event.parameters.push(underlyingAmount);

  handleInitDeposit(event);

  assert.fieldEquals("DepositOperation", MOCK_ADDRESS_1, "idx", "1");
  assert.fieldEquals(
    "DepositOperation",
    MOCK_ADDRESS_1,
    "underlyingAmount",
    "1"
  );
  assert.fieldEquals("DepositOperation", MOCK_ADDRESS_1, "ustAmount", "1");
});

test("RearrangeDepositOperation updates the DepositOperation idx", () => {
  clearStore();

  let mockDepositEvent = newMockEvent();
  const depositEvent = new InitDepositStable(
    mockDepositEvent.address,
    mockDepositEvent.logIndex,
    mockDepositEvent.transactionLogIndex,
    mockDepositEvent.logType,
    mockDepositEvent.block,
    mockDepositEvent.transaction,
    mockDepositEvent.parameters
  );
  depositEvent.parameters = new Array();

  let operator = newAddress("operator", MOCK_ADDRESS_1);
  let idx = newI32("idx", 1);
  let underlyingAmount = newI32("underlyingAmount", 1);
  let ustAmount = newI32("ustAmount", 1);

  depositEvent.parameters.push(operator);
  depositEvent.parameters.push(idx);
  depositEvent.parameters.push(ustAmount);
  depositEvent.parameters.push(underlyingAmount);

  handleInitDeposit(depositEvent);

  let mockDepositEvent1 = newMockEvent();
  const depositEvent1 = new InitDepositStable(
    mockDepositEvent1.address,
    mockDepositEvent1.logIndex,
    mockDepositEvent1.transactionLogIndex,
    mockDepositEvent1.logType,
    mockDepositEvent1.block,
    mockDepositEvent1.transaction,
    mockDepositEvent1.parameters
  );
  depositEvent1.parameters = new Array();

  operator = newAddress("operator", MOCK_ADDRESS_2);
  idx = newI32("idx", 2);

  depositEvent1.parameters.push(operator);
  depositEvent1.parameters.push(idx);
  depositEvent1.parameters.push(ustAmount);
  depositEvent1.parameters.push(underlyingAmount);

  handleInitDeposit(depositEvent1);

  let mockEvent = newMockEvent();
  const event = new RearrangeDepositOperation(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  const operatorFrom = newAddress("operatorFrom", MOCK_ADDRESS_2);
  const operatorTo = newAddress("operatorTo", MOCK_ADDRESS_1);
  idx = newI32("idx", 1);

  event.parameters.push(operatorFrom);
  event.parameters.push(operatorTo);
  event.parameters.push(idx);

  assert.fieldEquals("DepositOperation", MOCK_ADDRESS_2, "idx", "2");
  assert.fieldEquals("DepositOperation", MOCK_ADDRESS_1, "idx", "1");

  handleRearrangeDeposit(event);

  assert.fieldEquals("DepositOperation", MOCK_ADDRESS_2, "idx", "1");
  assert.fieldEquals("DepositOperation", MOCK_ADDRESS_1, "idx", "1");
});

test("handleFinishDeposit deletes the DepositOperation", () => {
  clearStore();

  const depositOperation = new DepositOperation(MOCK_ADDRESS_1);
  depositOperation.save();

  let mockEvent = newMockEvent();
  const event = new FinishDepositStable(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  const operator = newAddress("operator", MOCK_ADDRESS_1);

  event.parameters.push(operator);

  handleFinishDeposit(event);

  assert.notInStore("DepositOperation", MOCK_ADDRESS_1);
});

test("handleInitRedeem creates a RedeemOperation", () => {
  clearStore();

  let mockEvent = newMockEvent();
  const event = new InitRedeemStable(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  const operator = newAddress("operator", MOCK_ADDRESS_1);
  const idx = newI32("idx", 1);
  const aUstAmount = newI32("aUstAmount", 1);

  event.parameters.push(operator);
  event.parameters.push(idx);
  event.parameters.push(aUstAmount);

  handleInitRedeem(event);

  assert.fieldEquals("RedeemOperation", MOCK_ADDRESS_1, "aUstAmount", "1");
});

test("RearrangeRedeemOperation updates the RedeemOperation idx", () => {
  clearStore();

  let mockRedeemEvent = newMockEvent();
  const redeemEvent = new InitRedeemStable(
    mockRedeemEvent.address,
    mockRedeemEvent.logIndex,
    mockRedeemEvent.transactionLogIndex,
    mockRedeemEvent.logType,
    mockRedeemEvent.block,
    mockRedeemEvent.transaction,
    mockRedeemEvent.parameters
  );
  redeemEvent.parameters = new Array();

  let operator = newAddress("operator", MOCK_ADDRESS_1);
  let aUstAmount = newI32("aUstAmount", 1);
  let idx = newI32("idx", 1);

  redeemEvent.parameters.push(operator);
  redeemEvent.parameters.push(idx);
  redeemEvent.parameters.push(aUstAmount);

  handleInitRedeem(redeemEvent);

  let mockRedeemEvent1 = newMockEvent();
  const redeemEvent1 = new InitRedeemStable(
    mockRedeemEvent1.address,
    mockRedeemEvent1.logIndex,
    mockRedeemEvent1.transactionLogIndex,
    mockRedeemEvent1.logType,
    mockRedeemEvent1.block,
    mockRedeemEvent1.transaction,
    mockRedeemEvent1.parameters
  );
  redeemEvent1.parameters = new Array();

  operator = newAddress("operator", MOCK_ADDRESS_2);
  idx = newI32("idx", 2);

  redeemEvent1.parameters.push(operator);
  redeemEvent1.parameters.push(idx);
  redeemEvent1.parameters.push(aUstAmount);

  handleInitRedeem(redeemEvent1);

  const mockEvent = newMockEvent();
  const event = new RearrangeRedeemOperation(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  const operatorFrom = newAddress("operatorFrom", MOCK_ADDRESS_2);
  const operatorTo = newAddress("operatorTo", MOCK_ADDRESS_1);
  idx = newI32("idx", 1);

  event.parameters.push(operatorFrom);
  event.parameters.push(operatorTo);
  event.parameters.push(idx);

  assert.fieldEquals("RedeemOperation", MOCK_ADDRESS_2, "idx", "2");
  assert.fieldEquals("RedeemOperation", MOCK_ADDRESS_1, "idx", "1");

  handleRearrangeRedeem(event);

  assert.fieldEquals("RedeemOperation", MOCK_ADDRESS_2, "idx", "1");
  assert.fieldEquals("RedeemOperation", MOCK_ADDRESS_1, "idx", "1");
});

test("handleFinishRedeem updates the RedeemOperation", () => {
  clearStore();

  const depositOperation = new RedeemOperation(MOCK_ADDRESS_1);
  depositOperation.save();

  let mockEvent = newMockEvent();
  const event = new FinishRedeemStable(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  const operator = newAddress("operator", MOCK_ADDRESS_1);

  event.parameters.push(operator);

  handleFinishRedeem(event);

  assert.notInStore("RedeemOperation", MOCK_ADDRESS_1);
});

test("handleTreasuryUpdated updates the treasury", () => {
  clearStore();

  let mockEvent = newMockEvent();
  const event = new TreasuryUpdated(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  const treasury = newAddress("treasury", MOCK_ADDRESS_1);
  event.parameters.push(treasury);

  // create vault
  const vault = new Vault(mockEvent.address.toHexString());
  vault.save();

  handleTreasuryUpdated(event);

  assert.fieldEquals(
    "Vault",
    mockEvent.address.toHexString(),
    "treasury",
    MOCK_ADDRESS_1
  );
});

test("handleSponsored creates a Sponsor", () => {
  clearStore();

  let mockEvent = newMockEvent();
  const event = new Sponsored(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  const idParam = newI32("id", 1);
  const amount = newI32("amount", 1);
  const depositor = newAddress("depositor", MOCK_ADDRESS_1);
  const lockedUntil = newI32("lockedUntil", 1);
  const burned = newBool("burned", false);

  event.parameters.push(idParam);
  event.parameters.push(amount);
  event.parameters.push(depositor);
  event.parameters.push(lockedUntil);
  event.parameters.push(burned);

  handleSponsored(event);

  assert.fieldEquals("Sponsor", "1", "amount", "1");
  assert.fieldEquals("Sponsor", "1", "depositor", MOCK_ADDRESS_1);
  assert.fieldEquals("Sponsor", "1", "burned", "false");
});

test("handleUnsponsored removes a Sponsor by marking as burned", () => {
  clearStore();

  const sponsor = new Sponsor("1");
  sponsor.burned = false;
  sponsor.save();

  let mockEvent = newMockEvent();
  const event = new Unsponsored(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  const idParam = newI32("id", 1);

  event.parameters.push(idParam);

  handleUnsponsored(event);

  assert.fieldEquals("Sponsor", "1", "burned", "true");
});

test("handleDepositMinted creates a Deposit", () => {
  clearStore();

  let mockEvent = newMockEvent();
  const event = new DepositMinted(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  const vault = new Vault(mockEvent.address.toHexString());
  vault.save();

  const idParam = newI32("id", 1);
  const groupId = newI32("groupId", 1);
  const amount = newI32("amount", 1);
  const shares = newI32("shares", 1);
  const depositor = newAddress("depositor", MOCK_ADDRESS_1);
  const claimer = newAddress("claimer", MOCK_ADDRESS_1);
  const claimerId = newI32("claimerId", 1);
  const lockedUntil = newI32("lockedUntil", 1);
  const data = newBytes("data", Bytes.empty());
  const name = newString("name", "Foundation");

  event.parameters.push(idParam);
  event.parameters.push(groupId);
  event.parameters.push(amount);
  event.parameters.push(shares);
  event.parameters.push(depositor);
  event.parameters.push(claimer);
  event.parameters.push(claimerId);
  event.parameters.push(lockedUntil);
  event.parameters.push(data);
  event.parameters.push(name);

  handleDepositMinted(event);

  assert.fieldEquals("Deposit", "1", "amount", "1");
  assert.fieldEquals("Deposit", "1", "depositor", MOCK_ADDRESS_1);
  assert.fieldEquals("Deposit", "1", "claimer", "1");
  assert.fieldEquals("Claimer", "1", "principal", "1");
  assert.fieldEquals("Claimer", "1", "depositsIds", "[1]");

  const foundationId = `${vault.id}-1`;
  assert.fieldEquals("Foundation", foundationId, "name", "Foundation");
  assert.fieldEquals("Foundation", foundationId, "owner", MOCK_ADDRESS_1);
  assert.fieldEquals("Foundation", foundationId, "vault", vault.id);
  assert.fieldEquals("Foundation", foundationId, "amountDeposited", "1");
  assert.fieldEquals("Foundation", foundationId, "lockedUntil", "1");
  assert.fieldEquals(
    "Foundation",
    foundationId,
    "createdAt",
    event.block.timestamp.toString()
  );
});

test("handleDepositWithdrawn removes a Deposit by marking as burned", () => {
  clearStore();

  let mockEvent = newMockEvent();

  const claimer = new Claimer("1");
  claimer.save();

  const deposit = new Deposit("1");
  deposit.burned = false;
  deposit.amount = BigInt.fromI32(1);
  deposit.lockedUntil = BigInt.fromI32(1);
  deposit.shares = BigInt.fromI32(1);
  deposit.claimer = "1";
  deposit.foundation = "1";
  deposit.save();

  const vault = new Vault(mockEvent.address.toHexString());
  vault.save();

  const foundation = new Foundation("1");
  foundation.vault = mockEvent.address.toHexString();
  foundation.save();

  const event = new DepositWithdrawn(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  event.parameters.push(newI32("id", 1));
  event.parameters.push(newI32("shares", 1));
  event.parameters.push(newI32("amount", 1));
  event.parameters.push(newAddress("to", MOCK_ADDRESS_1));
  event.parameters.push(newBool("burned", true));

  handleDepositWithdrawn(event);

  assert.fieldEquals("Deposit", "1", "burned", "true");
  assert.fieldEquals("Foundation", "1", "amountDeposited", "0");
});

test("handleYieldClaimed reduces shares from Deposits and creates Donations", () => {
  clearStore();

  let mockEvent = newMockEvent();

  // Create deposits
  createDeposit("1", 50, false, "1", "1", 1, 50);
  createDeposit("2", 100, false, "1", "1", 1, 100);

  // Create vault
  const vault = new Vault(mockEvent.address.toHexString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  // Create claimer
  const claimer = new Claimer("1");
  claimer.vault = mockEvent.address.toHexString();
  claimer.depositsIds = ["1", "2"];
  claimer.save();

  // Create foundation
  const foundation = new Foundation("1");
  foundation.vault = mockEvent.address.toHexString();
  foundation.save();

  const event = new YieldClaimed(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  event.parameters.push(newI32("claimerId", 1));
  event.parameters.push(newAddress("to", TREASURY_ADDRESS));
  event.parameters.push(newI32("amount", 150));
  event.parameters.push(newI32("burnedShares", 75));
  event.parameters.push(newI32("perfFee", 0));

  handleYieldClaimed(event);

  assert.fieldEquals("Deposit", "1", "shares", "25");
  assert.fieldEquals("Deposit", "2", "shares", "50");

  assert.fieldEquals("Donation", donationId(mockEvent, "0"), "amount", "50");
  assert.fieldEquals("Donation", donationId(mockEvent, "1"), "amount", "100");

  clearStore();
});

test("handleYieldClaimed takes the performance fee into account", () => {
  clearStore();

  let mockEvent = newMockEvent();

  // Create deposits
  createDeposit("1", 50, false, "1", "1", 1, 50);
  createDeposit("2", 100, false, "1", "1", 1, 100);

  // Create vault
  const vault = new Vault(mockEvent.address.toHexString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  // Create claimer
  const claimer = new Claimer("1");
  claimer.vault = mockEvent.address.toHexString();
  claimer.depositsIds = ["1", "2"];
  claimer.save();

  // Create foundation
  const foundation = new Foundation("1");
  foundation.vault = mockEvent.address.toHexString();
  foundation.save();

  const event = new YieldClaimed(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  event.parameters.push(newI32("claimerId", 1));
  event.parameters.push(newAddress("to", TREASURY_ADDRESS));
  event.parameters.push(newI32("amount", 120));
  event.parameters.push(newI32("burnedShares", 75));
  event.parameters.push(newI32("perfFee", 30));

  handleYieldClaimed(event);

  assert.fieldEquals("Claimer", "1", "claimed", "120");

  assert.fieldEquals("Deposit", "1", "shares", "25");
  assert.fieldEquals("Deposit", "2", "shares", "50");

  assert.fieldEquals("Donation", donationId(mockEvent, "0"), "amount", "40");
  assert.fieldEquals("Donation", donationId(mockEvent, "1"), "amount", "80");

  clearStore();
});

test("handleYieldClaimed doesn't create donations if the deposits are not to the treasury", () => {
  clearStore();

  let mockEvent = newMockEvent();

  // Create deposits
  createDeposit("1", 50, false, "1", "1", 1, 50);
  createDeposit("2", 100, false, "1", "1", 1, 100);

  // Create vault
  const vault = new Vault(mockEvent.address.toHexString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  // Create claimer
  const claimer = new Claimer("1");
  claimer.vault = mockEvent.address.toHexString();
  claimer.depositsIds = ["1", "2"];
  claimer.save();

  // Create foundation
  const foundation = new Foundation("1");
  foundation.vault = mockEvent.address.toHexString();
  foundation.save();

  const event = new YieldClaimed(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  event.parameters.push(newI32("claimerId", 1));
  event.parameters.push(newAddress("to", MOCK_ADDRESS_1));
  event.parameters.push(newI32("amount", 150));
  event.parameters.push(newI32("burnedShares", 75));
  event.parameters.push(newI32("perfFee", 0));

  handleYieldClaimed(event);

  assert.notInStore("Donation", donationId(mockEvent, "0"));
  assert.notInStore("Donation", donationId(mockEvent, "1"));

  clearStore();
});

test("handleYieldClaimed handles scenarios where only one of the deposits generated yield", () => {
  clearStore();

  let mockEvent = newMockEvent();

  // Create deposits
  createDeposit("1", 50, false, "1", "1", 1, 50);
  createDeposit("2", 100, false, "1", "1", 1, 50);

  const vault = new Vault(mockEvent.address.toHexString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  const claimer = new Claimer("1");
  claimer.vault = mockEvent.address.toHexString();
  claimer.depositsIds = ["1", "2"];
  claimer.save();

  const foundation = new Foundation("1");
  foundation.vault = mockEvent.address.toHexString();
  foundation.save();

  const event = new YieldClaimed(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  event.parameters.push(newI32("claimerId", 1));
  event.parameters.push(newAddress("to", TREASURY_ADDRESS));
  event.parameters.push(newI32("amount", 50));
  event.parameters.push(newI32("burnedShares", 25));
  event.parameters.push(newI32("perfFee", 0));

  handleYieldClaimed(event);

  assert.fieldEquals("Deposit", "1", "shares", "25");
  assert.fieldEquals("Deposit", "2", "shares", "50");

  assert.fieldEquals("Donation", donationId(mockEvent, "0"), "amount", "50");
});

test("handleYieldClaimed handles scenarios where the yield is not proportional to the deposit shares", () => {
  clearStore();

  let mockEvent = newMockEvent();

  createDeposit("1", 50, false, "1", "1", 1, 50);
  createDeposit("2", 100, false, "1", "1", 1, 50);

  const vault = new Vault(mockEvent.address.toHexString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  const claimer = new Claimer("1");
  claimer.vault = mockEvent.address.toHexString();
  claimer.depositsIds = ["1", "2"];
  claimer.save();

  const foundation = new Foundation("1");
  foundation.vault = mockEvent.address.toHexString();
  foundation.save();

  const event = new YieldClaimed(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  );
  event.parameters = new Array();

  event.parameters.push(newI32("claimerId", 1));
  event.parameters.push(newAddress("to", TREASURY_ADDRESS));
  event.parameters.push(newI32("amount", 147));
  event.parameters.push(newI32("burnedShares", 49));
  event.parameters.push(newI32("perfFee", 0));

  handleYieldClaimed(event);

  assert.fieldEquals("Deposit", "1", "shares", "17");
  assert.fieldEquals("Deposit", "2", "shares", "34");

  assert.fieldEquals("Donation", donationId(mockEvent, "0"), "amount", "99");
  assert.fieldEquals("Donation", donationId(mockEvent, "1"), "amount", "48");
});

function newBytes(name: string, value: Bytes): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromBytes(value));
}

function newI32(name: string, value: i32): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromI32(value));
}

function newBool(name: string, value: bool): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromBoolean(value));
}

function newAddress(name: string, value: string): ethereum.EventParam {
  return new ethereum.EventParam(
    name,
    ethereum.Value.fromAddress(Address.fromString(value))
  );
}

function newString(name: string, value: string): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromString(value));
}

function donationId(event: ethereum.Event, id: string): string {
  return (
    event.transaction.hash.toHex() + "-" + event.logIndex.toString() + "-" + id
  );
}

function createDeposit(
  id: string,
  amount: i32,
  burned: bool,
  claimer: string,
  foundation: string,
  lockedUntil: i32,
  shares: i32
): void {
  const deposit = new Deposit(id);
  deposit.amount = BigInt.fromI32(amount);
  deposit.burned = burned;
  deposit.claimer = claimer;
  deposit.foundation = foundation;
  deposit.lockedUntil = BigInt.fromI32(lockedUntil);
  deposit.shares = BigInt.fromI32(shares);
  deposit.save();
}
