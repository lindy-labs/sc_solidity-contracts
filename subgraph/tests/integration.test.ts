import { Address, Bytes, BigInt, ethereum } from '@graphprotocol/graph-ts';
import {
  test,
  assert,
  newMockEvent,
  clearStore,
  describe,
  beforeEach,
} from 'matchstick-as/assembly/index';

import {
  newParamBytes,
  newParamI32,
  newParamI32FromBigInt,
  newParamBool,
  newParamAddress,
  newParamString,
  donationId,
  createDeposit,
  MOCK_ADDRESS_1,
  MOCK_ADDRESS_2,
  TREASURY_ADDRESS,
  STRATEGY_ADDRESS,
  mockGetDepositorETHGain,
  setupLiquityMocks,
  mockLastGoodPrice,
} from '../tests/helpers';

import {
  handleDepositMinted,
  handleDepositWithdrawn,
  handleYieldClaimed,
} from '../src/mappings/vault';

import {
  handleETHGainWithdrawn,
  handleLiquidation,
  trackHighestPrice,
} from '../src/mappings/liquity';

import {
  DepositWithdrawn,
  DepositMinted,
  YieldClaimed,
} from '../src/types/Vault/IVault';

import { Liquidation as LiquidationEvent } from '../src/types/LiquityTrove/LiquityTrove';
import { ETHGainWithdrawn } from '../src/types/StabilityPool/StabilityPool';

import { Vault, Claimer, Foundation } from '../src/types/schema';

describe('integration', () => {
  beforeEach(() => {
    clearStore();
  });

  test('handles liquidation events', () => {
    let event = setupLiquityMocks();
    event.block.number = BigInt.fromI32(1);

    // nothing happens before the first liquidation event
    trackHighestPrice(event.block);

    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '0');

    // set vault strategy
    const vault = new Vault('0');
    vault.strategy = Address.fromString(STRATEGY_ADDRESS);
    vault.save();

    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '0');

    // nothing happens before the first liquidation event
    trackHighestPrice(event.block);

    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '0');

    mockGetDepositorETHGain('100');
    mockLastGoodPrice('100');

    // first liquidation event
    let liquidationEvent = createLiquidationEvent(event);

    handleLiquidation(liquidationEvent);

    let liquidationId =
      event.transaction.hash.toHexString() + '-' + event.logIndex.toString();

    assert.fieldEquals('Liquidation', liquidationId, 'strategyBalance', '100');
    assert.fieldEquals('Liquidation', liquidationId, 'ethPrice', '100');
    assert.fieldEquals('Liquidation', liquidationId, 'highestPrice', '0');

    // start tracking the highest price after the first liquidation event
    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '0');

    trackHighestPrice(event.block);

    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '1');
    assert.fieldEquals('LiquidationState', '0', 'highestPrice', '100');

    // ignore next 49 blocks
    event = newMockEvent();
    event.block.number = BigInt.fromI32(50);

    trackHighestPrice(event.block);

    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '1');
    assert.fieldEquals('LiquidationState', '0', 'highestPrice', '100');

    // update the higest price
    mockLastGoodPrice('101');

    event = newMockEvent();
    event.block.number = BigInt.fromI32(51);

    trackHighestPrice(event.block);

    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '51');
    assert.fieldEquals('LiquidationState', '0', 'highestPrice', '101');

    // ignore blocks where the price is lower
    mockLastGoodPrice('100');

    event = newMockEvent();
    event.block.number = BigInt.fromI32(200);

    trackHighestPrice(event.block);

    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '51');
    assert.fieldEquals('LiquidationState', '0', 'highestPrice', '101');

    // new liquidation
    event = newMockEvent();
    liquidationEvent = createLiquidationEvent(event);

    handleLiquidation(liquidationEvent);

    liquidationId =
      event.transaction.hash.toHexString() + '-' + event.logIndex.toString();

    assert.fieldEquals('Liquidation', liquidationId, 'strategyBalance', '100');
    assert.fieldEquals('Liquidation', liquidationId, 'ethPrice', '100');
    assert.fieldEquals('Liquidation', liquidationId, 'highestPrice', '101');

    // eth sold
    event = newMockEvent();
    const ethGainWithdrawnEvent = createETHGainWithdrawnEvent(event);

    ethGainWithdrawnEvent.parameters = new Array();
    ethGainWithdrawnEvent.parameters.push(
      newParamAddress('_depositor', STRATEGY_ADDRESS),
    );
    ethGainWithdrawnEvent.parameters.push(newParamI32('_ETH', 10));
    ethGainWithdrawnEvent.parameters.push(newParamI32('_LUSDLoss', 1));

    handleETHGainWithdrawn(ethGainWithdrawnEvent);

    assert.fieldEquals('LiquidationState', '0', 'highestPrice', '0');

    // more blocks
    mockLastGoodPrice('100');

    event = newMockEvent();
    event.block.number = BigInt.fromI32(300);

    trackHighestPrice(event.block);

    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '300');
    assert.fieldEquals('LiquidationState', '0', 'highestPrice', '100');
  });

  test('handles scenarios with rounding matters', () => {
    // Deposit 1

    let mockEvent = newMockEvent();
    const event = newDepositMintedEvent(mockEvent);

    event.parameters = new Array();

    const vault = new Vault('0');
    vault.save();

    let idParam = newParamI32('id', 1);
    const groupId = newParamI32('groupId', 1);
    let amount = newParamI32FromBigInt('amount', '500000000000000000000');
    let shares = newParamI32FromBigInt(
      'shares',
      '500000000000000000000000000000000000000',
    );
    let depositor = newParamAddress('depositor', MOCK_ADDRESS_1);
    let claimer = newParamAddress('claimer', MOCK_ADDRESS_1);
    let lockedUntil = newParamI32('lockedUntil', 1);
    let data = newParamBytes('data', Bytes.empty());
    let name = newParamString('name', 'Foundation');

    event.parameters.push(idParam);
    event.parameters.push(groupId);
    event.parameters.push(amount);
    event.parameters.push(shares);
    event.parameters.push(depositor);
    event.parameters.push(claimer);
    event.parameters.push(claimer);
    event.parameters.push(lockedUntil);
    event.parameters.push(data);
    event.parameters.push(name);

    handleDepositMinted(event);

    const foundationId = `${vault.id}-1`;

    // Deposit 2

    mockEvent = newMockEvent();
    const event2 = newDepositMintedEvent(mockEvent);

    event2.parameters = new Array();

    idParam = newParamI32('id', 2);
    depositor = newParamAddress('depositor', MOCK_ADDRESS_1);
    claimer = newParamAddress('claimer', MOCK_ADDRESS_2);
    lockedUntil = newParamI32('lockedUntil', 1);
    data = newParamBytes('data', Bytes.empty());
    name = newParamString('name', 'Foundation');

    event2.parameters.push(idParam);
    event2.parameters.push(groupId);
    event2.parameters.push(amount);
    event2.parameters.push(shares);
    event2.parameters.push(depositor);
    event2.parameters.push(claimer);
    event2.parameters.push(claimer);
    event2.parameters.push(lockedUntil);
    event2.parameters.push(data);
    event2.parameters.push(name);

    handleDepositMinted(event2);

    assert.fieldEquals('Foundation', foundationId, 'name', 'Foundation');
    assert.fieldEquals(
      'Foundation',
      foundationId,
      'amountDeposited',
      '1000000000000000000000',
    );
    assert.fieldEquals(
      'Foundation',
      foundationId,
      'shares',
      '1000000000000000000000000000000000000000',
    );
    assert.fieldEquals('Foundation', foundationId, 'lockedUntil', '1');

    // Claim Yield

    mockEvent = newMockEvent();
    const event3 = newYieldClaimedEvent(mockEvent);

    event3.parameters = new Array();
    event3.parameters.push(newParamAddress('claimerId', MOCK_ADDRESS_1));
    event3.parameters.push(newParamAddress('to', MOCK_ADDRESS_1));
    event3.parameters.push(
      newParamI32FromBigInt('amount', '49500000000000000000'),
    );
    event3.parameters.push(
      newParamI32FromBigInt(
        'burnedShares',
        '45454545454545454545454545454545454545',
      ),
    );
    event3.parameters.push(
      newParamI32FromBigInt('perfFee', '499999999999999999'),
    );
    event3.parameters.push(
      newParamI32FromBigInt('totalUnderlying', '1100000000000000000000'),
    );
    event3.parameters.push(
      newParamI32FromBigInt(
        'totalShares',
        '1000000000000000000000000000000000000000',
      ),
    );

    handleYieldClaimed(event3);
  });

  test('updates the Foundation', () => {
    let mockEvent = newMockEvent();
    const event = newDepositMintedEvent(mockEvent);

    event.parameters = new Array();

    const vault = new Vault('0');
    vault.save();

    let idParam = newParamI32('id', 1);
    const groupId = newParamI32('groupId', 1);
    let amount = newParamI32('amount', 30);
    let shares = newParamI32('shares', 30);
    let depositor = newParamAddress('depositor', MOCK_ADDRESS_1);
    let claimer = newParamAddress('claimer', MOCK_ADDRESS_1);
    let lockedUntil = newParamI32('lockedUntil', 1);
    let data = newParamBytes('data', Bytes.empty());
    let name = newParamString('name', 'Foundation');

    event.parameters.push(idParam);
    event.parameters.push(groupId);
    event.parameters.push(amount);
    event.parameters.push(shares);
    event.parameters.push(depositor);
    event.parameters.push(claimer);
    event.parameters.push(claimer);
    event.parameters.push(lockedUntil);
    event.parameters.push(data);
    event.parameters.push(name);

    handleDepositMinted(event);

    const foundationId = `${vault.id}-1`;

    assert.fieldEquals('Foundation', foundationId, 'name', 'Foundation');
    assert.fieldEquals('Foundation', foundationId, 'owner', MOCK_ADDRESS_1);
    assert.fieldEquals('Foundation', foundationId, 'vault', vault.id);
    assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '30');
    assert.fieldEquals('Foundation', foundationId, 'shares', '30');
    assert.fieldEquals('Foundation', foundationId, 'lockedUntil', '1');
    assert.fieldEquals(
      'Foundation',
      foundationId,
      'createdAt',
      event.block.timestamp.toString(),
    );

    // Second deposit

    mockEvent = newMockEvent();
    const event2 = newDepositMintedEvent(mockEvent);

    event2.parameters = new Array();

    idParam = newParamI32('id', 2);
    amount = newParamI32('amount', 40);
    shares = newParamI32('shares', 40);
    depositor = newParamAddress('depositor', MOCK_ADDRESS_1);
    claimer = newParamAddress('claimer', MOCK_ADDRESS_1);
    lockedUntil = newParamI32('lockedUntil', 2);
    data = newParamBytes('data', Bytes.empty());
    name = newParamString('name', 'Foundation 2');

    event2.parameters.push(idParam);
    event2.parameters.push(groupId);
    event2.parameters.push(amount);
    event2.parameters.push(shares);
    event2.parameters.push(depositor);
    event2.parameters.push(claimer);
    event2.parameters.push(claimer);
    event2.parameters.push(lockedUntil);
    event2.parameters.push(data);
    event2.parameters.push(name);

    handleDepositMinted(event2);

    assert.fieldEquals('Foundation', foundationId, 'name', 'Foundation 2');
    assert.fieldEquals('Foundation', foundationId, 'owner', MOCK_ADDRESS_1);
    assert.fieldEquals('Foundation', foundationId, 'vault', vault.id);
    assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '70');
    assert.fieldEquals('Foundation', foundationId, 'shares', '70');
    assert.fieldEquals('Foundation', foundationId, 'lockedUntil', '2');
    assert.fieldEquals(
      'Foundation',
      foundationId,
      'createdAt',
      event.block.timestamp.toString(),
    );

    // Partial withdraw

    mockEvent = newMockEvent();
    const event3 = new DepositWithdrawn(
      mockEvent.address,
      mockEvent.logIndex,
      mockEvent.transactionLogIndex,
      mockEvent.logType,
      mockEvent.block,
      mockEvent.transaction,
      mockEvent.parameters,
      null,
    );
    event3.parameters = new Array();

    event3.parameters.push(newParamI32('id', 1));
    event3.parameters.push(newParamI32('shares', 10));
    event3.parameters.push(newParamI32('amount', 10));
    event3.parameters.push(newParamAddress('to', MOCK_ADDRESS_1));
    event3.parameters.push(newParamBool('burned', false));

    handleDepositWithdrawn(event3);

    assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '60');
    assert.fieldEquals('Foundation', foundationId, 'shares', '60');
    assert.fieldEquals('Foundation', foundationId, 'amountClaimed', '0');

    // Claim yield

    mockEvent = newMockEvent();
    const event4 = newYieldClaimedEvent(mockEvent);

    event4.parameters = new Array();
    event4.parameters.push(newParamAddress('claimerId', MOCK_ADDRESS_1));
    event4.parameters.push(newParamAddress('to', MOCK_ADDRESS_1));
    event4.parameters.push(newParamI32('amount', 60));
    event4.parameters.push(newParamI32('burnedShares', 30));
    event4.parameters.push(newParamI32('perfFee', 0));
    event4.parameters.push(newParamI32('totalUnderlying', 120));
    event4.parameters.push(newParamI32('totalShares', 60));

    handleYieldClaimed(event4);

    assert.fieldEquals('Foundation', foundationId, 'amountDeposited', '60');
    assert.fieldEquals('Foundation', foundationId, 'shares', '30');
    assert.fieldEquals('Foundation', foundationId, 'amountClaimed', '60');
  });

  test('handleYieldClaimed handles scenarios where only one of the deposits generated yield', () => {
    let mockEvent = newMockEvent();

    // Create deposits
    createDeposit('1', 50, false, '1', '1', 1, 50);
    createDeposit('2', 100, false, '1', '1', 1, 50);

    const vault = new Vault('0');
    vault.treasury = Address.fromString(TREASURY_ADDRESS);
    vault.save();

    const claimer = new Claimer(MOCK_ADDRESS_2);
    claimer.vault = vault.id;
    claimer.depositsIds = ['1', '2'];
    claimer.save();

    const foundation = new Foundation('1');
    foundation.vault = vault.id;
    foundation.save();

    const event = newYieldClaimedEvent(mockEvent);

    event.parameters = new Array();
    event.parameters.push(newParamAddress('claimerId', MOCK_ADDRESS_2));
    event.parameters.push(newParamAddress('to', TREASURY_ADDRESS));
    event.parameters.push(newParamI32('amount', 50));
    event.parameters.push(newParamI32('burnedShares', 25));
    event.parameters.push(newParamI32('perfFee', 0));
    event.parameters.push(newParamI32('totalUnderlying', 200));
    event.parameters.push(newParamI32('totalShares', 100));

    handleYieldClaimed(event);

    assert.fieldEquals('Deposit', '1', 'shares', '25');
    assert.fieldEquals('Deposit', '2', 'shares', '50');

    assert.fieldEquals('Donation', donationId(mockEvent, '0'), 'amount', '50');
  });

  test('handleYieldClaimed handles scenarios where the yield is not proportional to the deposit shares', () => {
    let mockEvent = newMockEvent();

    createDeposit('1', 50, false, '1', '1', 1, 50);
    createDeposit('2', 100, false, '1', '1', 1, 50);

    const vault = new Vault('0');
    vault.treasury = Address.fromString(TREASURY_ADDRESS);
    vault.save();

    const claimer = new Claimer(MOCK_ADDRESS_2);
    claimer.vault = vault.id;
    claimer.depositsIds = ['1', '2'];
    claimer.save();

    const foundation = new Foundation('1');
    foundation.vault = vault.id;
    foundation.save();

    const event = newYieldClaimedEvent(mockEvent);

    event.parameters = new Array();
    event.parameters.push(newParamAddress('claimerId', MOCK_ADDRESS_2));
    event.parameters.push(newParamAddress('to', TREASURY_ADDRESS));
    event.parameters.push(newParamI32('amount', 147));
    event.parameters.push(newParamI32('burnedShares', 49));
    event.parameters.push(newParamI32('perfFee', 0));
    // these numbers are only used to calculate the pricer per share
    // in this scenario, it's impossible to find the real numbers, so'll just use these two
    // because only the ratio between them matters for the purpose of this test
    event.parameters.push(newParamI32('totalUnderlying', 147));
    event.parameters.push(newParamI32('totalShares', 49));

    handleYieldClaimed(event);

    assert.fieldEquals('Deposit', '1', 'shares', '17');
    assert.fieldEquals('Deposit', '2', 'shares', '34');

    assert.fieldEquals('Donation', donationId(mockEvent, '0'), 'amount', '99');
    assert.fieldEquals('Donation', donationId(mockEvent, '1'), 'amount', '48');
  });

  test("yield distribution does not stay the same when there's more than one yield recipient", () => {
    let mockEvent = newMockEvent();

    createDeposit('1', 50, false, '1', '1', 1, 500);
    createDeposit('2', 50, false, '2', '1', 1, 500);

    const vault = new Vault('0');
    vault.treasury = Address.fromString(TREASURY_ADDRESS);
    vault.totalShares = BigInt.fromI32(1000);
    vault.save();

    const alice = new Claimer(MOCK_ADDRESS_1);
    alice.vault = vault.id;
    alice.depositsIds = ['1'];
    alice.save();

    const bob = new Claimer(MOCK_ADDRESS_2);
    bob.vault = vault.id;
    bob.depositsIds = ['2'];
    bob.save();

    const foundation = new Foundation('1');
    foundation.vault = vault.id;
    foundation.save();

    // Vault generates 100 units of yield

    // Bob claimes 50 units of yield
    const event1 = newYieldClaimedEvent(mockEvent);
    event1.parameters = new Array();
    event1.parameters.push(newParamAddress('claimerId', MOCK_ADDRESS_2));
    event1.parameters.push(newParamAddress('to', MOCK_ADDRESS_2));
    event1.parameters.push(newParamI32('amount', 50));
    event1.parameters.push(newParamI32('burnedShares', 250));
    event1.parameters.push(newParamI32('perfFee', 0));
    event1.parameters.push(newParamI32('totalUnderlying', 200));
    event1.parameters.push(newParamI32('totalShares', 1000));

    handleYieldClaimed(event1);

    assert.fieldEquals('Deposit', '1', 'shares', '500');
    assert.fieldEquals('Deposit', '2', 'shares', '250');
    assert.fieldEquals('Vault', '0', 'totalShares', '750');
    assert.fieldEquals('Deposit', '1', 'amountClaimed', '0');
    assert.fieldEquals('Deposit', '2', 'amountClaimed', '50');

    // Vault generates more 150 units of yield

    // Bob claims 50 units of yield
    const event2 = newYieldClaimedEvent(mockEvent);
    event2.parameters = new Array();
    event2.parameters.push(newParamAddress('claimerId', MOCK_ADDRESS_2));
    event2.parameters.push(newParamAddress('to', MOCK_ADDRESS_2));
    event2.parameters.push(newParamI32('amount', 50));
    event2.parameters.push(newParamI32('burnedShares', 125));
    event2.parameters.push(newParamI32('perfFee', 0));
    event2.parameters.push(newParamI32('totalUnderlying', 300));
    event2.parameters.push(newParamI32('totalShares', 750));

    handleYieldClaimed(event2);

    assert.fieldEquals('Deposit', '1', 'shares', '500');
    assert.fieldEquals('Deposit', '2', 'shares', '125');
    assert.fieldEquals('Vault', '0', 'totalShares', '625');
    assert.fieldEquals('Deposit', '1', 'amountClaimed', '0');
    assert.fieldEquals('Deposit', '2', 'amountClaimed', '100');

    // Finally, Alice claims all her yield
    const event3 = newYieldClaimedEvent(mockEvent);
    event3.parameters = new Array();
    event3.parameters.push(newParamAddress('claimerId', MOCK_ADDRESS_1));
    event3.parameters.push(newParamAddress('to', MOCK_ADDRESS_1));
    event3.parameters.push(newParamI32('amount', 150));
    event3.parameters.push(newParamI32('burnedShares', 375));
    event3.parameters.push(newParamI32('perfFee', 0));
    event3.parameters.push(newParamI32('totalUnderlying', 250));
    event3.parameters.push(newParamI32('totalShares', 625));

    handleYieldClaimed(event3);

    assert.fieldEquals('Deposit', '1', 'shares', '125');
    assert.fieldEquals('Deposit', '2', 'shares', '125');
    assert.fieldEquals('Vault', '0', 'totalShares', '250');
    // In the end, there was a total of 250 units of yield generated
    // Alice claimed 150 units of yield
    // Bob only claimed 100 units of yield
    assert.fieldEquals('Deposit', '1', 'amountClaimed', '150');
    assert.fieldEquals('Deposit', '2', 'amountClaimed', '100');
  });
});

function newYieldClaimedEvent(event: ethereum.Event): YieldClaimed {
  return new YieldClaimed(
    event.address,
    event.logIndex,
    event.transactionLogIndex,
    event.logType,
    event.block,
    event.transaction,
    event.parameters,
    null,
  );
}

function newDepositMintedEvent(event: ethereum.Event): DepositMinted {
  return new DepositMinted(
    event.address,
    event.logIndex,
    event.transactionLogIndex,
    event.logType,
    event.block,
    event.transaction,
    event.parameters,
    null,
  );
}

function createLiquidationEvent(event: ethereum.Event): LiquidationEvent {
  const liquidationEvent = new LiquidationEvent(
    event.address,
    event.logIndex,
    event.transactionLogIndex,
    event.logType,
    event.block,
    event.transaction,
    event.parameters,
    null,
  );

  liquidationEvent.parameters = new Array();
  liquidationEvent.parameters.push(newParamI32('liquidatedDebt', 200000));
  liquidationEvent.parameters.push(newParamI32('liquidatedCollateral', 1000));
  liquidationEvent.parameters.push(newParamI32('collGasCompensation', 5));
  liquidationEvent.parameters.push(newParamI32('tokenGasCompensation', 200000));

  return liquidationEvent;
}

function createETHGainWithdrawnEvent(event: ethereum.Event): ETHGainWithdrawn {
  return new ETHGainWithdrawn(
    event.address,
    event.logIndex,
    event.transactionLogIndex,
    event.logType,
    event.block,
    event.transaction,
    event.parameters,
    null,
  );
}
