import { Liquidation, LiquidationCounter } from '../types/schema';
import {
  Liquidation as LiquidationEvent,
  LiquityTrove,
} from '../types/LiquityTrove/LiquityTrove';
import {
  ETHGainWithdrawn,
  StabilityPool,
} from '../types/StabilityPool/StabilityPool';
import { BigInt } from '@graphprotocol/graph-ts';

export function handleLiquidation(event: LiquidationEvent): void {
  // Bind the contract to the address that emitted the event
  let trove = LiquityTrove.bind(event.address);
  let pool = StabilityPool.bind(trove.stabilityPool());

  let liquidationCounter = LiquidationCounter.load('0');
  if (liquidationCounter == null) {
    liquidationCounter = new LiquidationCounter('0');
    liquidationCounter.index = BigInt.fromString('0');
    liquidationCounter.strategyBalance = BigInt.fromString('0');
  }

  liquidationCounter.strategyBalance = pool.getDepositorETHGain(event.transaction.from);

  const liquidation = new Liquidation(liquidationCounter.index.toString());

  liquidation.timestamp = event.block.timestamp;
  liquidation.txHash = event.transaction.hash;
  liquidation.liquidatedDebt = event.params._liquidatedDebt;
  liquidation.liquidatedCollateral = event.params._liquidatedColl;
  liquidation.collGasCompensation = event.params._collGasCompensation;
  liquidation.tokenGasCompensation = event.params._LUSDGasCompensation;
  liquidation.strategyBalance = liquidationCounter.strategyBalance;
  liquidation.save();

  liquidationCounter.index = liquidationCounter.index.plus(
    BigInt.fromString('1'),
  );
  liquidationCounter.save();
}

export function handleETHGainWithdrawn(
  _event: ETHGainWithdrawn,
): void {
  let liquidationCounter = LiquidationCounter.load('0');
  if (liquidationCounter == null) {
    liquidationCounter = new LiquidationCounter('0');
    liquidationCounter.index = BigInt.fromString('0');
    liquidationCounter.strategyBalance = BigInt.fromString('0');
  }

  liquidationCounter.strategyBalance = BigInt.fromString('0');

  liquidationCounter.save();
}
