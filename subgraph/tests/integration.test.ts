import { log, ethereum, Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  test,
  assert,
  newMockEvent,
  clearStore
} from "matchstick-as/assembly/index";

import {
  handleDepositMinted,
  handleSponsored,
  handleUnsponsored,
  handleDepositBurned,
  handleYieldClaimed,
  handleTreasuryUpdated
} from "../src/mappings/vault";
import {
  Sponsored,
  Unsponsored
} from "../src/types/templates/Vault/IVaultSponsoring";
import {
  DepositBurned,
  DepositMinted,
  TreasuryUpdated,
  YieldClaimed
} from "../src/types/templates/Vault/IVault";
import {
  Vault,
  Deposit,
  Sponsor,
  Claimer,
  Foundation
} from "../generated/schema";

const MOCK_ADDRESS_1 = "0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd".toLowerCase();
const TREASURY_ADDRESS = "0x4940c6e628da11ac0bdcf7f82be8579b4696fa33";

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
  const vault = new Vault(mockEvent.address.toString());
  vault.save();

  handleTreasuryUpdated(event);

  assert.fieldEquals(
    "Vault",
    mockEvent.address.toString(),
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

  const vault = new Vault(mockEvent.address.toString());
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

  event.parameters.push(idParam);
  event.parameters.push(groupId);
  event.parameters.push(amount);
  event.parameters.push(shares);
  event.parameters.push(depositor);
  event.parameters.push(claimer);
  event.parameters.push(claimerId);
  event.parameters.push(lockedUntil);
  event.parameters.push(data);

  handleDepositMinted(event);

  assert.fieldEquals("Deposit", "1", "amount", "1");
  assert.fieldEquals("Deposit", "1", "depositor", MOCK_ADDRESS_1);
  assert.fieldEquals("Deposit", "1", "claimer", "1");
  assert.fieldEquals("Claimer", "1", "principal", "1");
  assert.fieldEquals("Claimer", "1", "depositsIds", "[1]");
});

test("handleDepositBurned removes a Deposit by marking as burned", () => {
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

  const vault = new Vault(mockEvent.address.toString());
  vault.save();

  const foundation = new Foundation("1");
  foundation.vault = mockEvent.address.toString();
  foundation.save();

  const event = new DepositBurned(
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
  event.parameters.push(newAddress("to", MOCK_ADDRESS_1));

  handleDepositBurned(event);

  assert.fieldEquals("Deposit", "1", "burned", "true");
});

test("handleYieldClaimed creates Donations and reduces shares from Deposits", () => {
  clearStore();

  let mockEvent = newMockEvent();

  // Create deposits
  const deposit = new Deposit("1");
  deposit.burned = false;
  deposit.amount = BigInt.fromI32(50);
  deposit.lockedUntil = BigInt.fromI32(1);
  deposit.shares = BigInt.fromI32(50);
  deposit.claimer = "1";
  deposit.foundation = "1";
  deposit.save();

  const deposit2 = new Deposit("2");
  deposit2.burned = false;
  deposit2.amount = BigInt.fromI32(100);
  deposit2.lockedUntil = BigInt.fromI32(1);
  deposit2.shares = BigInt.fromI32(100);
  deposit2.claimer = "1";
  deposit2.foundation = "1";
  deposit2.save();

  // Create vault
  const vault = new Vault(mockEvent.address.toString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  // Create claimer
  const claimer = new Claimer("1");
  claimer.vault = mockEvent.address.toString();
  claimer.depositsIds = ["1", "2"];
  claimer.save();

  // Create foundation
  const foundation = new Foundation("1");
  foundation.vault = mockEvent.address.toString();
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

  handleYieldClaimed(event);

  assert.fieldEquals("Deposit", "1", "shares", "25");
  assert.fieldEquals("Deposit", "2", "shares", "50");

  assert.fieldEquals("Donation", donationId(mockEvent, "0"), "amount", "50");
  assert.fieldEquals("Donation", donationId(mockEvent, "1"), "amount", "100");

  clearStore();
});

test("handleYieldClaimed handles scenarios where only one of the deposits generated yield", () => {
  clearStore();

  let mockEvent = newMockEvent();

  const deposit = new Deposit("1");
  deposit.burned = false;
  deposit.amount = BigInt.fromI32(50);
  deposit.lockedUntil = BigInt.fromI32(1);
  deposit.shares = BigInt.fromI32(50);
  deposit.claimer = "1";
  deposit.foundation = "1";
  deposit.save();

  const deposit2 = new Deposit("2");
  deposit2.burned = false;
  deposit2.amount = BigInt.fromI32(100);
  deposit2.lockedUntil = BigInt.fromI32(1);
  deposit2.shares = BigInt.fromI32(50);
  deposit2.claimer = "1";
  deposit2.foundation = "1";
  deposit2.save();

  const vault = new Vault(mockEvent.address.toString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  const claimer = new Claimer("1");
  claimer.vault = mockEvent.address.toString();
  claimer.depositsIds = ["1", "2"];
  claimer.save();

  const foundation = new Foundation("1");
  foundation.vault = mockEvent.address.toString();
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

  handleYieldClaimed(event);

  assert.fieldEquals("Deposit", "1", "shares", "25");
  assert.fieldEquals("Deposit", "2", "shares", "50");

  assert.fieldEquals("Donation", donationId(mockEvent, "0"), "amount", "50");
});

test("handleYieldClaimed handles scenarios where the yield is not proportional to the deposit shares", () => {
  clearStore();

  let mockEvent = newMockEvent();

  const deposit = new Deposit("1");
  deposit.burned = false;
  deposit.amount = BigInt.fromI32(50);
  deposit.lockedUntil = BigInt.fromI32(1);
  deposit.shares = BigInt.fromI32(50);
  deposit.claimer = "1";
  deposit.foundation = "1";
  deposit.save();

  const deposit2 = new Deposit("2");
  deposit2.burned = false;
  deposit2.amount = BigInt.fromI32(100);
  deposit2.lockedUntil = BigInt.fromI32(1);
  deposit2.shares = BigInt.fromI32(50);
  deposit2.claimer = "1";
  deposit2.foundation = "1";
  deposit2.save();

  const vault = new Vault(mockEvent.address.toString());
  vault.treasury = Address.fromString(TREASURY_ADDRESS);
  vault.save();

  const claimer = new Claimer("1");
  claimer.vault = mockEvent.address.toString();
  claimer.depositsIds = ["1", "2"];
  claimer.save();

  const foundation = new Foundation("1");
  foundation.vault = mockEvent.address.toString();
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

function donationId(event: ethereum.Event, id: string): string {
  return (
    event.transaction.hash.toHex() + "-" + event.logIndex.toString() + "-" + id
  );
}
