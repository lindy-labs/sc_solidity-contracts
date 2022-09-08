import { Liquidation } from '../types/schema';
import {
  Liquidation as LiquidationEvent,
  LiquityTrove,
} from '../types/LiquityTrove/LiquityTrove';
import {
  StabilityPoolETHBalanceUpdated,
  StabilityPool,
} from '../types/StabilityPool/StabilityPool';
import { BigInt, ethereum } from '@graphprotocol/graph-ts';

export function handleLiquidation(event: LiquidationEvent): void {
  const liquidation = new Liquidation(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString(),
  );

  // Bind the contract to the address that emitted the event
  // let trove = LiquityTrove.bind(event.address);
  // let pool = StabilityPool.bind(trove.stabilityPool());

  liquidation.timestamp = event.block.timestamp;
  liquidation.txHash = event.transaction.hash;
  liquidation.liquidatedDebt = event.params._liquidatedDebt;
  liquidation.liquidatedCollateral = event.params._liquidatedColl;
  liquidation.collGasCompensation = event.params._collGasCompensation;
  liquidation.tokenGasCompensation = event.params._LUSDGasCompensation;
  // liquidation.strategyBalance = liquidation.strategyBalance.plus(
  //   pool.getDepositorETHGain(event.transaction.from),
  // );
  liquidation.strategyBalance = new BigInt(0);

  liquidation.save();
}

// export function handleStabilityPoolETHBalanceUpdated(
//   event: StabilityPoolETHBalanceUpdated,
// ): void {}
