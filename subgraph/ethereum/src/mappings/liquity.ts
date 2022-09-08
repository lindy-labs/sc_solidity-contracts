import { Liquidation } from '../types/schema';
import { Liquidation as LiquidationEvent } from '../types/LiquityTrove/LiquityTrove';

export function handleLiquidation(event: LiquidationEvent): void {
  const liquidation = new Liquidation(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  );

  liquidation.timestamp = event.block.timestamp;
  liquidation.txHash = event.transaction.hash;
  liquidation.liquidatedDebt = event.params._liquidatedDebt;
  liquidation.liquidatedCollateral = event.params._liquidatedColl;
  liquidation.collGasCompensation = event.params._collGasCompensation;
  liquidation.tokenGasCompensation = event.params._LUSDGasCompensation;

  liquidation.save();
}
