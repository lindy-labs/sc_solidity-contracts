import { Liquidation } from '../types/schema';
import {
  Liquidation as LiquidationEvent,
  LiquityTrove,
} from '../types/LiquityTrove/LiquityTrove';
import { ETHGainWithdrawn, StabilityPool } from '../types/StabilityPool/StabilityPool';
import { LastGoodPriceUpdated, LiquityPriceFeed } from '../types/LiquityPriceFeed/LiquityPriceFeed';
import { Address } from '@graphprotocol/graph-ts';

export function handleLiquidation(event: LiquidationEvent): void {
  // bind the contract to the address that emitted the event
  let trove = LiquityTrove.bind(event.address);
  let pool = StabilityPool.bind(trove.stabilityPool());
  let priceFeed = LiquityPriceFeed.bind(trove.priceFeed());

  const liquidationId =
    event.transaction.hash.toHex() + '-' + event.logIndex.toString();

  const liquidation = new Liquidation(liquidationId);

  liquidation.timestamp = event.block.timestamp;
  liquidation.txHash = event.transaction.hash;
  liquidation.liquidatedDebt = event.params._liquidatedDebt;
  liquidation.liquidatedCollateral = event.params._liquidatedColl;
  liquidation.collGasCompensation = event.params._collGasCompensation;
  liquidation.tokenGasCompensation = event.params._LUSDGasCompensation;
  liquidation.strategyBalance = pool.getDepositorETHGain(
    Address.fromString('0x2b1Ce1eF546051d38A8e23917520a7A9C05Da281'),
  );
  liquidation.ethPrice = priceFeed.lastGoodPrice();

  liquidation.save();
}

export function handleETHGainWithdraw(_event: ETHGainWithdrawn): void {}

export function handleLastGoodPriceUpdated(_event: LastGoodPriceUpdated): void {}
