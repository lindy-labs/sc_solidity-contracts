import { Liquidation, LiquidationCounter } from '../types/schema';
import {
  Liquidation as LiquidationEvent,
  LiquityTrove,
} from '../types/LiquityTrove/LiquityTrove';
import {
  StabilityPoolETHBalanceUpdated,
  StabilityPool,
} from '../types/StabilityPool/StabilityPool';
import { BigInt } from '@graphprotocol/graph-ts';

export function handleLiquidation(event: LiquidationEvent): void {
  const liquidation = new Liquidation(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  );

  // Bind the contract to the address that emitted the event
  let trove = LiquityTrove.bind(event.address);
  let pool = StabilityPool.bind(trove.stabilityPool());

  liquidation.timestamp = event.block.timestamp;
  liquidation.txHash = event.transaction.hash;
  liquidation.liquidatedDebt = event.params._liquidatedDebt;
  liquidation.liquidatedCollateral = event.params._liquidatedColl;
  liquidation.collGasCompensation = event.params._collGasCompensation;
  liquidation.tokenGasCompensation = event.params._LUSDGasCompensation;
  liquidation.strategyBalance = (new BigInt(0)).plus(
    pool.getDepositorETHGain(event.transaction.from),
  );

  let liquidationCounter = LiquidationCounter.load('0');
  if (liquidationCounter == null) {
    liquidationCounter = new LiquidationCounter('0');
    liquidationCounter.index = BigInt.fromString('0');
  }

  liquidation.save();

  liquidationCounter.index = liquidationCounter.index.plus(BigInt.fromString('1'));
  liquidationCounter.save();
}

export function handleStabilityPoolETHBalanceUpdated(
  event: StabilityPoolETHBalanceUpdated,
): void {}
