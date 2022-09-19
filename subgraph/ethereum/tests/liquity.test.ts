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
import { newI32 } from '../../tests/helpers';

test('TroveManager Liquidation event creates Liquidation record', () => {
  clearStore();

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
  );
  liquidationEvent.parameters = new Array();

  liquidationEvent.parameters.push(newI32('liquidatedDebt', 200000));
  liquidationEvent.parameters.push(newI32('liquidatedCollateral', 1166));
  liquidationEvent.parameters.push(newI32('collGasCompensation', 5));
  liquidationEvent.parameters.push(newI32('tokenGasCompensation', 200000));

  const stabilityPoolAddress = '0xC80B3caAd6d2DE80Ac76a41d5F0072E36D2519Cd'.toLowerCase();
  const priceFeedAddress = '0xE80B3caAd6d2DE80Ac76a41d5F0072E36D2519Ce'.toLowerCase();

  createMockedFunction(
    mockLiquidation.address,
    'stabilityPool',
    'stabilityPool():(address)',
  )
    .withArgs([])
    .returns([ethereum.Value.fromAddress(Address.fromString(stabilityPoolAddress))]);

  createMockedFunction(
    mockLiquidation.address,
    'priceFeed',
    'priceFeed():(address)',
  )
    .withArgs([])
    .returns([ethereum.Value.fromAddress(Address.fromString(priceFeedAddress))]);

  createMockedFunction(
    Address.fromString(stabilityPoolAddress),
    'getDepositorETHGain',
    'getDepositorETHGain(address):(uint256)',
  )
    .withArgs([ethereum.Value.fromAddress(Address.fromString('0x2b1Ce1eF546051d38A8e23917520a7A9C05Da281'))])
    .returns([ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1234"))]);

  createMockedFunction(
    Address.fromString(priceFeedAddress),
    'lastGoodPrice',
    'lastGoodPrice():(uint256)',
  )
    .withArgs([])
    .returns([ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1234"))]);

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

  assert.fieldEquals(
    'Liquidation',
    liquidationId,
    'strategyBalance',
    '1234',
  );

  clearStore();
});
