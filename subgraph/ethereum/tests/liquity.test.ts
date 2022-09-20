import { Bytes } from '@graphprotocol/graph-ts';
import {
  test,
  assert,
  newMockEvent,
  clearStore,
  createMockedFunction,
} from 'matchstick-as/assembly/index';
import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts';

import { handleLiquidation } from '../src/mappings/liquity';
import { Liquidation as LiquidationEvent } from '../src/types/LiquityTrove/LiquityTrove';
import { newParamI32, newValueAddress, newValueI32FromBigInt } from '../../tests/helpers';

import { Liquidation, Vault } from '../src/types/schema';

const STRATEGY_ADDRESS = '0xc90b3caad6d2de80ac76a41d5f0072e36d2519cd'.toLowerCase();
const STABILITY_POOL_ADDRESS = '0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd'.toLowerCase();
const PRICE_FEED_ADDRESS = '0xE80B3caAd6d2DE80Ac76a41d5F0072E36D2519Ce'.toLowerCase();


test('TroveManager Liquidation event creates Liquidation record', () => {
  clearStore();
  setupMocks();

    // create vault
  const vault = new Vault('0');
  vault.strategy = Address.fromString(STRATEGY_ADDRESS);
  vault.save();

  let mockLiquidation = newMockEvent();

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

function setupMocks() {
  createMockedFunction(
    mockLiquidation.address,
    'stabilityPool',
    'stabilityPool():(address)',
  )
    .withArgs([])
    .returns([
      newValueAddress(STABILITY_POOL_ADDRESS),
    ]);

  createMockedFunction(
    mockLiquidation.address,
    'priceFeed',
    'priceFeed():(address)',
  )
    .withArgs([])
    .returns([
      newValueAddress(PRICE_FEED_ADDRESS),
    ]);
}
