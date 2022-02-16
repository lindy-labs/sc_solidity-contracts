import { log, ethereum, Address, Bytes, BigInt } from "@graphprotocol/graph-ts";
import { test, assert, newMockEvent } from "matchstick-as/assembly/index";

import {
  handleDepositMinted,
  handleSponsored,
  handleUnsponsored,
  handleDepositBurned
} from "../src/mappings/vault";
import {
  Sponsored,
  Unsponsored
} from "../src/types/templates/Vault/IVaultSponsoring";
import {
  DepositBurned,
  DepositMinted
} from "../src/types/templates/Vault/IVault";
import {
  Vault,
  Deposit,
  Sponsor,
  Claimer,
  Foundation
} from "../generated/schema";

const MOCK_ADDRESS_1 = "0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd".toLowerCase();

test("handleSponsored creates a Sponsor", () => {
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
