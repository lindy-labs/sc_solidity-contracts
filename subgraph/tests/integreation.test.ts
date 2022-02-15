import {
  log,
  ethereum,
  Address,
  BigInt,
  Bytes,
  ByteArray
} from "@graphprotocol/graph-ts";
import {
  clearStore,
  test,
  assert,
  newMockEvent
} from "matchstick-as/assembly/index";

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

  const idParam = new ethereum.EventParam("id", ethereum.Value.fromI32(1000));
  const amount = new ethereum.EventParam(
    "amount",
    ethereum.Value.fromI32(1000)
  );
  const depositor = new ethereum.EventParam(
    "depositor",
    ethereum.Value.fromAddress(
      Address.fromString("0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd")
    )
  );
  const lockedUntil = new ethereum.EventParam(
    "lockedUntil",
    ethereum.Value.fromI32(1000)
  );
  const burned = new ethereum.EventParam(
    "burned",
    ethereum.Value.fromBoolean(false)
  );

  event.parameters.push(idParam);
  event.parameters.push(amount);
  event.parameters.push(depositor);
  event.parameters.push(lockedUntil);
  event.parameters.push(burned);

  handleSponsored(event);

  assert.fieldEquals("Sponsor", "1000", "amount", "1000");

  assert.fieldEquals(
    "Sponsor",
    "1000",
    "depositor",
    "0xc80b3caad6d2de80ac76a41d5f0072e36d2519cd"
  );

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

  const idParam = new ethereum.EventParam("id", ethereum.Value.fromI32(1000));

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

  const idParam = new ethereum.EventParam("id", ethereum.Value.fromI32(1000));
  const groupId = new ethereum.EventParam(
    "groupId",
    ethereum.Value.fromI32(1000)
  );
  const amount = new ethereum.EventParam(
    "amount",
    ethereum.Value.fromI32(1000)
  );
  const shares = new ethereum.EventParam(
    "shares",
    ethereum.Value.fromI32(1000)
  );
  const depositor = new ethereum.EventParam(
    "depositor",
    ethereum.Value.fromAddress(
      Address.fromString("0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd")
    )
  );
  const claimer = new ethereum.EventParam(
    "claimer",
    ethereum.Value.fromAddress(
      Address.fromString("0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd")
    )
  );
  const claimerId = new ethereum.EventParam(
    "claimerId",
    ethereum.Value.fromI32(1000)
  );
  const lockedUntil = new ethereum.EventParam(
    "lockedUntil",
    ethereum.Value.fromI32(1000)
  );
  const data = new ethereum.EventParam(
    "data",
    ethereum.Value.fromBytes(Bytes.empty())
  );

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

  assert.fieldEquals(
    "Deposit",
    "1000",
    "depositor",
    "0xc80b3caad6d2de80ac76a41d5f0072e36d2519cd"
  );

  assert.fieldEquals("Claimer", "1000", "principal", "1000");
  assert.fieldEquals("Claimer", "1000", "depositsIds", "[1000]");
});
