import {
  test,
  assert,
  newMockEvent,
  clearStore,
} from 'matchstick-as/assembly/index';
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

  handleLiquidation(liquidationEvent);

  assert.fieldEquals('Liquidation', liquidationId, 'timestamp', mockLiquidation.block.timestamp.toString());
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

  clearStore();
});
