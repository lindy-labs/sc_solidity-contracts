import { Bytes } from '@graphprotocol/graph-ts';
import {
  describe,
  test,
  beforeEach,
  assert,
  clearStore,
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
  newParamAddress,
  STRATEGY_ADDRESS,
  PRICE_FEED_ADDRESS,
  STABILITY_POOL_ADDRESS,
  mockGetDepositorETHGain,
  setupLiquityMocks,
  mockLastGoodPrice,
} from '../../tests/helpers';

import { LiquidationState, Vault } from '../src/types/schema';

let mockedEvent: ethereum.Event;

beforeEach(() => {
  clearStore();
  mockedEvent = setupLiquityMocks();
});

test('trackHighestPrice updates the highestPrice and lastBlock', () => {
  createVault();

  const liquidationState = new LiquidationState('0');
  liquidationState.highestPrice = BigInt.fromString('0');
  liquidationState.priceFeed = Address.fromString(PRICE_FEED_ADDRESS);
  liquidationState.save();

  mockLastGoodPrice('1234');

  trackHighestPrice(mockedEvent.block);

  assert.fieldEquals('LiquidationState', '0', 'highestPrice', '1234');
  assert.fieldEquals(
    'LiquidationState',
    '0',
    'lastBlock',
    mockedEvent.block.number.toString(),
  );
});

test('trackHighestPrice does not run if the new price is not higher', () => {
  createVault();

  const liquidationState = new LiquidationState('0');
  liquidationState.lastBlock = BigInt.fromI32(0);
  liquidationState.highestPrice = BigInt.fromI32(1235);
  liquidationState.priceFeed = Address.fromString(PRICE_FEED_ADDRESS);
  liquidationState.save();

  mockLastGoodPrice('1234');

  trackHighestPrice(mockedEvent.block);

  assert.fieldEquals('LiquidationState', '0', 'highestPrice', '1235');
  assert.fieldEquals('LiquidationState', '0', 'lastBlock', '0');
});

test('trackHighestPrice does not run if the block is not 50 blocks after the previous one', () => {
  createVault();

  const liquidationState = new LiquidationState('0');
  liquidationState.lastBlock = BigInt.fromI32(50);
  liquidationState.highestPrice = BigInt.fromI32(0);
  liquidationState.priceFeed = Address.fromString(PRICE_FEED_ADDRESS);
  liquidationState.save();

  mockLastGoodPrice('1234');

  mockedEvent.block.number = BigInt.fromI32(51);

  trackHighestPrice(mockedEvent.block);

  assert.fieldEquals('LiquidationState', '0', 'highestPrice', '0');
  assert.fieldEquals('LiquidationState', '0', 'lastBlock', '50');
});

test("handleETHGainWithdrawn doesn't run if the strategy is not set", () => {
  createVaultWithoutStrategy();

  const ethGainWithdrawnEvent = createETHGainWithdrawnEvent(mockedEvent);

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
  createVault();

  const liquidationState = new LiquidationState('0');
  liquidationState.highestPrice = BigInt.fromString('1000000000000000000');
  liquidationState.save();

  assert.fieldEquals(
    'LiquidationState',
    '0',
    'highestPrice',
    '1000000000000000000',
  );

  const ethGainWithdrawnEvent = createETHGainWithdrawnEvent(mockedEvent);

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
  createVault();

  const liquidationState = new LiquidationState('0');
  liquidationState.highestPrice = BigInt.fromString('1000000000000000000');
  liquidationState.save();

  assert.fieldEquals(
    'LiquidationState',
    '0',
    'highestPrice',
    '1000000000000000000',
  );

  const ethGainWithdrawnEvent = createETHGainWithdrawnEvent(mockedEvent);

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

  test("doesn't run when vault strategy isn't set", () => {
    createVaultWithoutStrategy();

    const liquidationEvent = createLiquidationEvent(mockedEvent);
    liquidationEvent.parameters = new Array();
    liquidationEvent.parameters.push(newParamI32('liquidatedDebt', 200000));
    liquidationEvent.parameters.push(newParamI32('liquidatedCollateral', 1000));
    liquidationEvent.parameters.push(newParamI32('collGasCompensation', 5));
    liquidationEvent.parameters.push(
      newParamI32('tokenGasCompensation', 200000),
    );

    handleLiquidation(liquidationEvent);

    const liquidationId =
      mockedEvent.transaction.hash.toHexString() +
      '-' +
      mockedEvent.logIndex.toString();

    assert.notInStore('Liquidation', liquidationId);
  });

  test('creates a new LiquidationState entity when there is none', () => {
    createVault();

    const liquidationEvent = createLiquidationEvent(mockedEvent);
    liquidationEvent.parameters = new Array();
    liquidationEvent.parameters.push(newParamI32('liquidatedDebt', 200000));
    liquidationEvent.parameters.push(newParamI32('liquidatedCollateral', 1000));
    liquidationEvent.parameters.push(newParamI32('collGasCompensation', 5));
    liquidationEvent.parameters.push(
      newParamI32('tokenGasCompensation', 200000),
    );

    assert.notInStore('LiquidationState', '0');

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

  test('updates the LiquidationState priceFeed', () => {
    const oldPriceFeedAddress =
      '0x2E645469f354BB4F5c8a05B3b30A929361cf77eC'.toLowerCase();

    createVault();

    let liquidationState = new LiquidationState('0');
    liquidationState.priceFeed = Bytes.fromHexString(oldPriceFeedAddress);
    liquidationState.save();

    const liquidationEvent = createLiquidationEvent(mockedEvent);
    liquidationEvent.parameters = new Array();
    liquidationEvent.parameters.push(newParamI32('liquidatedDebt', 200000));
    liquidationEvent.parameters.push(newParamI32('liquidatedCollateral', 1000));
    liquidationEvent.parameters.push(newParamI32('collGasCompensation', 5));
    liquidationEvent.parameters.push(
      newParamI32('tokenGasCompensation', 200000),
    );

    assert.fieldEquals(
      'LiquidationState',
      '0',
      'priceFeed',
      oldPriceFeedAddress,
    );

    handleLiquidation(liquidationEvent);

    assert.fieldEquals(
      'LiquidationState',
      '0',
      'priceFeed',
      PRICE_FEED_ADDRESS,
    );
  });

  test('creates a new Liquidation entity', () => {
    createVault();

    const liquidationEvent = createLiquidationEvent(mockedEvent);
    liquidationEvent.parameters = new Array();
    liquidationEvent.parameters.push(newParamI32('liquidatedDebt', 200000));
    liquidationEvent.parameters.push(newParamI32('liquidatedCollateral', 1000));
    liquidationEvent.parameters.push(newParamI32('collGasCompensation', 5));
    liquidationEvent.parameters.push(
      newParamI32('tokenGasCompensation', 200000),
    );

    handleLiquidation(liquidationEvent);

    const liquidationId =
      mockedEvent.transaction.hash.toHexString() +
      '-' +
      mockedEvent.logIndex.toString();

    assert.fieldEquals(
      'Liquidation',
      liquidationId,
      'timestamp',
      mockedEvent.block.timestamp.toString(),
    );
    assert.fieldEquals(
      'Liquidation',
      liquidationId,
      'txHash',
      mockedEvent.transaction.hash.toHexString(),
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
  return new LiquidationEvent(
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
