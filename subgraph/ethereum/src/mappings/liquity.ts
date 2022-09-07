import { BigInt, log } from '@graphprotocol/graph-ts';
import { Liquidation } from '../types/schema';

export function handleLiquidation(event: Liquidation): void {
  const liquidation = new Liquidation(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  );

  liquidation.txHash = event.transaction.hash.toHex();
  liquidation.liquidatedDebt = event.params.liquidatedDebt;
  liquidation.liquidatedCollateral = event.params.liquidatedCollateral;
  liquidation.collGasCompensation = event.params.collGasCompensation;
  liquidation.tokenGasCompensation = event.params.tokenGasCompensation;

  liquidation.save();
}
