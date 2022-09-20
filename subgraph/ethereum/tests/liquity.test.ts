import { Bytes, log } from '@graphprotocol/graph-ts';
import {
  test,
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
} from '../../tests/helpers';

import { Liquidation, LiquidationState, Vault } from '../src/types/schema';

const STRATEGY_ADDRESS = '0xc90b3caad6d2de80ac76a41d5f0072e36d2519cd'.toLowerCase();
const STABILITY_POOL_ADDRESS = '0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd'.toLowerCase();
const PRICE_FEED_ADDRESS = '0xE80B3caAd6d2DE80Ac76a41d5F0072E36D2519Ce'.toLowerCase();

test('trackHighestPrice updates the highestPrice and lastBlock', () => {
  clearStore();
  const mockETHGainWithdrawn = setupMocks();

  // create vault
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();

  const liquidationState = new LiquidationState('0');
  liquidationState.highestPrice = BigInt.fromString('0');
  liquidationState.priceFeed = Address.fromString(PRICE_FEED_ADDRESS);
  liquidationState.save();

  createMockedFunction(
    Address.fromString(PRICE_FEED_ADDRESS),
    'lastGoodPrice',
    'lastGoodPrice():(uint256)',
  )
    .withArgs([])
    .returns([newValueI32FromBigInt('1234')]);

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
  clearStore();
  const mockETHGainWithdrawn = setupMocks();

  // create vault
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();

  const liquidationState = new LiquidationState('0');
  liquidationState.lastBlock = BigInt.fromI32(0);
  liquidationState.highestPrice = BigInt.fromI32(1235);
  liquidationState.priceFeed = Address.fromString(PRICE_FEED_ADDRESS);
  liquidationState.save();

  createMockedFunction(
    Address.fromString(PRICE_FEED_ADDRESS),
    'lastGoodPrice',
    'lastGoodPrice():(uint256)',
  )
    .withArgs([])
    .returns([newValueI32FromBigInt('1234')]);

  trackHighestPrice(mockETHGainWithdrawn.block);

  assert.fieldEquals('LiquidationState', '0', 'highestPrice', '1235');
  assert.fieldEquals('LiquidationState', '0', 'lastBlock', '0');
});

test('trackHighestPrice does not run if the block is not 50 blocks after the previous one', () => {
  clearStore();
  const mockETHGainWithdrawn = setupMocks();

  // create vault
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();

  const liquidationState = new LiquidationState('0');
  liquidationState.lastBlock = BigInt.fromI32(50);
  liquidationState.highestPrice = BigInt.fromI32(0);
  liquidationState.priceFeed = Address.fromString(PRICE_FEED_ADDRESS);
  liquidationState.save();

  createMockedFunction(
    Address.fromString(PRICE_FEED_ADDRESS),
    'lastGoodPrice',
    'lastGoodPrice():(uint256)',
  )
    .withArgs([])
    .returns([newValueI32FromBigInt('1234')]);

  mockETHGainWithdrawn.block.number = BigInt.fromI32(51);

  trackHighestPrice(mockETHGainWithdrawn.block);

  assert.fieldEquals('LiquidationState', '0', 'highestPrice', '0');
  assert.fieldEquals('LiquidationState', '0', 'lastBlock', '50');
});

test("handleETHGainWithdrawn doesn't run if the strategy is not set", () => {
  clearStore();
  const mockETHGainWithdrawn = setupMocks();

  // create vault
  const vault = new Vault('0');
  vault.save();

  const ethGainWithdrawnEvent = createETHGainWithdrawnEvent(
    mockETHGainWithdrawn,
  );

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
  clearStore();
  const mockETHGainWithdrawn = setupMocks();

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

  const ethGainWithdrawnEvent = createETHGainWithdrawnEvent(
    mockETHGainWithdrawn,
  );

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
  clearStore();
  const mockETHGainWithdrawn = setupMocks();

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

test('TroveManager Liquidation event creates Liquidation record', () => {
  clearStore();
  const mockLiquidation = setupMocks();

  // create vault
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();

  const liquidationId =
    mockLiquidation.transaction.hash.toHexString() +
    '-' +
    mockLiquidation.logIndex.toString();

  const liquidationEvent = new LiquidationEvent(
    mockLiquidation.address,
    mockLiquidation.logIndex,
    mockLiquidation.transactionLogIndex,
    mockLiquidation.logType,
    mockLiquidation.block,
    mockLiquidation.transaction,
    mockLiquidation.parameters,
    null,
  );
  liquidationEvent.parameters = new Array();

  liquidationEvent.parameters.push(newParamI32('liquidatedDebt', 200000));
  liquidationEvent.parameters.push(newParamI32('liquidatedCollateral', 1166));
  liquidationEvent.parameters.push(newParamI32('collGasCompensation', 5));
  liquidationEvent.parameters.push(newParamI32('tokenGasCompensation', 200000));

  createMockedFunction(
    Address.fromString(STABILITY_POOL_ADDRESS),
    'getDepositorETHGain',
    'getDepositorETHGain(address):(uint256)',
  )
    .withArgs([newValueAddress(STRATEGY_ADDRESS)])
    .returns([newValueI32FromBigInt('1234')]);

  createMockedFunction(
    Address.fromString(PRICE_FEED_ADDRESS),
    'lastGoodPrice',
    'lastGoodPrice():(uint256)',
  )
    .withArgs([])
    .returns([newValueI32FromBigInt('1234')]);

  handleLiquidation(liquidationEvent);

  assert.fieldEquals(
    'Liquidation',
    liquidationId,
    'timestamp',
    mockLiquidation.block.timestamp.toString(),
  );

  assert.fieldEquals('Liquidation', liquidationId, 'liquidatedDebt', '200000');

  assert.fieldEquals(
    'Liquidation',
    liquidationId,
    'liquidatedCollateral',
    '1166',
  );

  assert.fieldEquals('Liquidation', liquidationId, 'collGasCompensation', '5');

  assert.fieldEquals(
    'Liquidation',
    liquidationId,
    'tokenGasCompensation',
    '200000',
  );

  assert.fieldEquals('Liquidation', liquidationId, 'strategyBalance', '1234');

  clearStore();
});

function setupMocks(): ethereum.Event {
  let mockLiquidation = newMockEvent();

  createMockedFunction(
    mockLiquidation.address,
    'stabilityPool',
    'stabilityPool():(address)',
  )
    .withArgs([])
    .returns([newValueAddress(STABILITY_POOL_ADDRESS)]);

  createMockedFunction(
    mockLiquidation.address,
    'priceFeed',
    'priceFeed():(address)',
  )
    .withArgs([])
    .returns([newValueAddress(PRICE_FEED_ADDRESS)]);

  return mockLiquidation;
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
