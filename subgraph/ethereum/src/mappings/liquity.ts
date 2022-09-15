import { Liquidation } from '../types/schema';
import {
  Liquidation as LiquidationEvent,
  LiquityTrove,
} from '../types/LiquityTrove/LiquityTrove';
import {
  StabilityPool,
} from '../types/StabilityPool/StabilityPool';
import {
  LiquityPriceFeed,
} from '../types/LiquityPriceFeed/LiquityPriceFeed';
import { Address } from '@graphprotocol/graph-ts';

export function handleLiquidation(event: LiquidationEvent): void {
  // bind the contract to the address that emitted the event
  let trove = LiquityTrove.bind(event.address);
  let pool = StabilityPool.bind(trove.stabilityPool());
  let priceFeed = LiquityPriceFeed.bind(trove.priceFeed());

  const liquidation = new Liquidation(event.address.toHexString());

  liquidation.timestamp = event.block.timestamp;
  liquidation.txHash = event.transaction.hash;
  liquidation.liquidatedDebt = event.params._liquidatedDebt;
  liquidation.liquidatedCollateral = event.params._liquidatedColl;
  liquidation.collGasCompensation = event.params._collGasCompensation;
  liquidation.tokenGasCompensation = event.params._LUSDGasCompensation;
  liquidation.ethPrice = priceFeed.lastGoodPrice();
  liquidation.strategyBalance = pool.getDepositorETHGain(
    Address.fromString('0xf33fb13b1cBbCC4Ae28026Ec9a433A1AD6fea172'),
  );

  liquidation.save();
}
