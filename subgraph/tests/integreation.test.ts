import { log, ethereum, Address, Bytes } from "@graphprotocol/graph-ts";
import { test, assert, newMockEvent } from "matchstick-as/assembly/index";

import {
  handleDepositMinted,
  handleSponsored,
  handleUnsponsored
} from "../src/mappings/vault";
import {
  Sponsored,
  Unsponsored
} from "../src/types/templates/Vault/IVaultSponsoring";
import { DepositMinted } from "../src/types/templates/Vault/IVault";
import { Vault } from "../generated/schema";

const MOCK_ADDRESS_1 = "0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd".toLowerCase();

test("handleSponsored create a sponsor", () => {
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

  const idParam = newI32("id", 1000);
  const amount = newI32("amount", 1000);
  const depositor = newAddress("depositor", MOCK_ADDRESS_1);
  const lockedUntil = newI32("lockedUntil", 1000);
  const burned = newBool("burned", false);

  event.parameters.push(idParam);
  event.parameters.push(amount);
  event.parameters.push(depositor);
  event.parameters.push(lockedUntil);
  event.parameters.push(burned);

  handleSponsored(event);

  assert.fieldEquals("Sponsor", "1000", "amount", "1000");
  assert.fieldEquals("Sponsor", "1000", "depositor", MOCK_ADDRESS_1);
  assert.fieldEquals("Sponsor", "1000", "burned", "false");
});

test("handleUnsponsored removes a sponsor", () => {
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

  const idParam = newI32("id", 1000);

  event.parameters.push(idParam);

  handleUnsponsored(event);

  assert.fieldEquals("Sponsor", "1000", "burned", "true");
});

test("handleDepositMinted creates a deposit", () => {
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

  const idParam = newI32("id", 1000);
  const groupId = newI32("groupId", 1000);
  const amount = newI32("amount", 1000);
  const shares = newI32("shares", 1000);
  const depositor = newAddress("depositor", MOCK_ADDRESS_1);
  const claimer = newAddress("claimer", MOCK_ADDRESS_1);
  const claimerId = newI32("claimerId", 1000);
  const lockedUntil = newI32("lockedUntil", 1000);
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

  assert.fieldEquals("Deposit", "1000", "amount", "1000");
  assert.fieldEquals("Deposit", "1000", "depositor", MOCK_ADDRESS_1);
  assert.fieldEquals("Claimer", "1000", "principal", "1000");
  assert.fieldEquals("Claimer", "1000", "depositsIds", "[1000]");
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
