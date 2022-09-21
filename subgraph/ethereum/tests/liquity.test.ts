import { store } from '@graphprotocol/graph-ts';
import {
  describe,
  test,
  beforeEach,
  afterEach,
  assert,
  newMockEvent,
  clearStore,
  createMockedFunction,
} from 'matchstick-as/assembly/index';
import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts';

import {
  handleETHGainWithdrawn,
  handleLiquidation,
  trackHighestPrice,
} from '../src/mappings/liquity';
import { Liquidation as LiquidationEvent } from '../src/types/LiquityTrove/LiquityTrove';
import { ETHGainWithdrawn } from '../src/types/StabilityPool/StabilityPool';
import {
  newParamI32,
  newValueAddress,
  newValueI32FromBigInt,
  newParamAddress,
  STRATEGY_ADDRESS,
  PRICE_FEED_ADDRESS,
  STABILITY_POOL_ADDRESS,
  mockGetDepositorETHGain,
  setupLiquityMocks,
  mockLastGoodPrice,
} from '../../tests/helpers';

import { LiquidationState, Vault } from '../src/types/schema';

const STRATEGY_ADDRESS =
  '0xc90b3caad6d2de80ac76a41d5f0072e36d2519cd'.toLowerCase();
const STABILITY_POOL_ADDRESS =
  '0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd'.toLowerCase();
const PRICE_FEED_ADDRESS =
  '0xE80B3caAd6d2DE80Ac76a41d5F0072E36D2519Ce'.toLowerCase();

beforeEach(() => {
  clearStore();
});

test('trackHighestPrice updates the highestPrice and lastBlock', () => {
  const mockETHGainWithdrawn = setupLiquityMocks();

  // create vault
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();

  const liquidationState = new LiquidationState('0');
  liquidationState.highestPrice = BigInt.fromString('0');
  liquidationState.priceFeed = Address.fromString(PRICE_FEED_ADDRESS);
  liquidationState.save();

  mockLastGoodPrice('1234');

  trackHighestPrice(mockETHGainWithdrawn.block);

  assert.fieldEquals('LiquidationState', '0', 'highestPrice', '1234');
  assert.fieldEquals(
    'LiquidationState',
    '0',
    'lastBlock',
    mockETHGainWithdrawn.block.number.toString(),
  );
});

test('trackHighestPrice does not run if the new price is not higher', () => {
  const mockETHGainWithdrawn = setupLiquityMocks();

  // create vault
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();

  const liquidationState = new LiquidationState('0');
  liquidationState.lastBlock = BigInt.fromI32(0);
  liquidationState.highestPrice = BigInt.fromI32(1235);
  liquidationState.priceFeed = Address.fromString(PRICE_FEED_ADDRESS);
  liquidationState.save();

  mockLastGoodPrice('1234');

  trackHighestPrice(mockETHGainWithdrawn.block);

  assert.fieldEquals('LiquidationState', '0', 'highestPrice', '1235');
  assert.fieldEquals('LiquidationState', '0', 'lastBlock', '0');
});

test('trackHighestPrice does not run if the block is not 50 blocks after the previous one', () => {
  const mockETHGainWithdrawn = setupLiquityMocks();

  // create vault
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();

  const liquidationState = new LiquidationState('0');
  liquidationState.lastBlock = BigInt.fromI32(50);
  liquidationState.highestPrice = BigInt.fromI32(0);
  liquidationState.priceFeed = Address.fromString(PRICE_FEED_ADDRESS);
  liquidationState.save();

  mockLastGoodPrice('1234');

  mockETHGainWithdrawn.block.number = BigInt.fromI32(51);

  trackHighestPrice(mockETHGainWithdrawn.block);

  assert.fieldEquals('LiquidationState', '0', 'highestPrice', '0');
  assert.fieldEquals('LiquidationState', '0', 'lastBlock', '50');
});

test("handleETHGainWithdrawn doesn't run if the strategy is not set", () => {
  const mockETHGainWithdrawn = setupLiquityMocks();

  // create vault
  const vault = new Vault('0');
  vault.save();

  const ethGainWithdrawnEvent =
    createETHGainWithdrawnEvent(mockETHGainWithdrawn);

  ethGainWithdrawnEvent.parameters = new Array();
  ethGainWithdrawnEvent.parameters.push(
    newParamAddress('_depositor', STRATEGY_ADDRESS),
  );
  ethGainWithdrawnEvent.parameters.push(newParamI32('_ETH', 10));
  ethGainWithdrawnEvent.parameters.push(newParamI32('_LUSDLoss', 1));

  handleETHGainWithdrawn(ethGainWithdrawnEvent);

  assert.notInStore('LiquidationState', '0');
});

test("handleETHGainWithdrawn doesn't run if the _depositor is not the strategy", () => {
  const mockETHGainWithdrawn = setupLiquityMocks();

  // create vault
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();

  const liquidationState = new LiquidationState('0');
  liquidationState.highestPrice = BigInt.fromString('1000000000000000000');
  liquidationState.save();

  assert.fieldEquals(
    'LiquidationState',
    '0',
    'highestPrice',
    '1000000000000000000',
  );

  const ethGainWithdrawnEvent =
    createETHGainWithdrawnEvent(mockETHGainWithdrawn);

  ethGainWithdrawnEvent.parameters = new Array();
  ethGainWithdrawnEvent.parameters.push(
    newParamAddress('_depositor', STABILITY_POOL_ADDRESS),
  );
  ethGainWithdrawnEvent.parameters.push(newParamI32('_ETH', 10));
  ethGainWithdrawnEvent.parameters.push(newParamI32('_LUSDLoss', 1));

  handleETHGainWithdrawn(ethGainWithdrawnEvent);

  assert.fieldEquals(
    'LiquidationState',
    '0',
    'highestPrice',
    '1000000000000000000',
  );
});

test('handleETHGainWithdrawn sets the highest price to 0', () => {
  const mockETHGainWithdrawn = setupLiquityMocks();

  // create vault
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();

  const liquidationState = new LiquidationState('0');
  liquidationState.highestPrice = BigInt.fromString('1000000000000000000');
  liquidationState.save();

  assert.fieldEquals(
    'LiquidationState',
    '0',
    'highestPrice',
    '1000000000000000000',
  );

  const ethGainWithdrawnEvent = new ETHGainWithdrawn(
    mockETHGainWithdrawn.address,
    mockETHGainWithdrawn.logIndex,
    mockETHGainWithdrawn.transactionLogIndex,
    mockETHGainWithdrawn.logType,
    mockETHGainWithdrawn.block,
    mockETHGainWithdrawn.transaction,
    mockETHGainWithdrawn.parameters,
    null,
  );

  ethGainWithdrawnEvent.parameters = new Array();
  ethGainWithdrawnEvent.parameters.push(
    newParamAddress('_depositor', STRATEGY_ADDRESS),
  );
  ethGainWithdrawnEvent.parameters.push(newParamI32('_ETH', 10));
  ethGainWithdrawnEvent.parameters.push(newParamI32('_LUSDLoss', 1));

  handleETHGainWithdrawn(ethGainWithdrawnEvent);

  assert.fieldEquals('LiquidationState', '0', 'highestPrice', '0');
});

describe('handleLiquidation', () => {
  beforeEach(() => {
    mockGetDepositorETHGain('2000');

    mockLastGoodPrice('1500');
  });

  test('creates a new LiquidationState entity when there is none', () => {
    createVault();
    const event = setupLiquityMocks();
    const liquidationEvent = createLiquidationEvent(event);
    handleLiquidation(liquidationEvent);

    assert.fieldEquals('LiquidationState', '0', 'highestPrice', '0');
    assert.fieldEquals(
      'LiquidationState',
      '0',
      'priceFeed',
      PRICE_FEED_ADDRESS,
    );
    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '0');
  });

  test('loads the existing LiquidationState entity when one exists', () => {
    createVault();
    let liquidationState = new LiquidationState('0');
    liquidationState.highestPrice = BigInt.fromString('10');
    liquidationState.lastBlock = BigInt.fromString('100');
    liquidationState.save();

    const event = setupLiquityMocks();
    const liquidationEvent = createLiquidationEvent(event);
    handleLiquidation(liquidationEvent);

    assert.fieldEquals('LiquidationState', '0', 'highestPrice', '10');
    assert.fieldEquals(
      'LiquidationState',
      '0',
      'priceFeed',
      PRICE_FEED_ADDRESS,
    );
    assert.fieldEquals('LiquidationState', '0', 'lastBlock', '100');
  });

  test("doesn't run when strategy isn't set", () => {
    createVaultWithoutStrategy();
    const event = setupLiquityMocks();
    const liquidationEvent = createLiquidationEvent(event);
    handleLiquidation(liquidationEvent);

    const liquidationId =
      event.transaction.hash.toHexString() + '-' + event.logIndex.toString();

    assert.notInStore('LiquidationState', '0');
    assert.notInStore('Liquidation', liquidationId);
  });

  test("doesn't run when there is no vault", () => {
    const event = setupLiquityMocks();
    const liquidationEvent = createLiquidationEvent(event);
    handleLiquidation(liquidationEvent);

    const liquidationId =
      event.transaction.hash.toHexString() + '-' + event.logIndex.toString();

    assert.notInStore('LiquidationState', '0');
    assert.notInStore('Liquidation', liquidationId);
  });

  test('creates a new Liquidation entity', () => {
    createVault();
    const event = setupLiquityMocks();
    const liquidationEvent = createLiquidationEvent(event);

    handleLiquidation(liquidationEvent);

    const liquidationId =
      event.transaction.hash.toHexString() + '-' + event.logIndex.toString();

    assert.fieldEquals(
      'Liquidation',
      liquidationId,
      'timestamp',
      event.block.timestamp.toString(),
    );
    assert.fieldEquals(
      'Liquidation',
      liquidationId,
      'txHash',
      event.transaction.hash.toHexString(),
    );
    assert.fieldEquals(
      'Liquidation',
      liquidationId,
      'liquidatedDebt',
      '200000',
    );
    assert.fieldEquals(
      'Liquidation',
      liquidationId,
      'liquidatedCollateral',
      '1000',
    );
    assert.fieldEquals(
      'Liquidation',
      liquidationId,
      'collGasCompensation',
      '5',
    );
    assert.fieldEquals(
      'Liquidation',
      liquidationId,
      'tokenGasCompensation',
      '200000',
    );
    assert.fieldEquals('Liquidation', liquidationId, 'strategyBalance', '2000');
    assert.fieldEquals('Liquidation', liquidationId, 'ethPrice', '1500');
    assert.fieldEquals('Liquidation', liquidationId, 'highestPrice', '0');
  });
});

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

function createVault(): void {
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();
}

function createVaultWithoutStrategy(): void {
  const vault = new Vault('0');
  vault.save();
}
