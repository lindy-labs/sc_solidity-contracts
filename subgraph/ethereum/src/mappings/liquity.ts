import { Liquidation, LiquidationCounter } from '../types/schema';
import {
  Liquidation as LiquidationEvent,
  LiquityTrove,
} from '../types/LiquityTrove/LiquityTrove';
import {
  ETHGainWithdrawn,
  StabilityPool,
} from '../types/StabilityPool/StabilityPool';
import {
  LastGoodPriceUpdated,
  LiquityPriceFeed,
} from '../types/LiquityPriceFeed/LiquityPriceFeed';
import { Address, BigInt } from '@graphprotocol/graph-ts';

export function handleLiquidation(event: LiquidationEvent): void {
  // Bind the contract to the address that emitted the event
  let trove = LiquityTrove.bind(event.address);
  let pool = StabilityPool.bind(trove.stabilityPool());
  let priceFeed = LiquityPriceFeed.bind(trove.priceFeed());

  let liquidationCounter = LiquidationCounter.load('0');
  if (liquidationCounter == null) {
    liquidationCounter = new LiquidationCounter('0');
    liquidationCounter.index = BigInt.fromString('0');
  }

  // const liquidation = new Liquidation(liquidationCounter.index.toString());
  const liquidation = new Liquidation(liquidationCounter.index.toString());

  liquidation.index = liquidationCounter.index;
  liquidation.txHash = event.transaction.hash;
  liquidation.liquidatedDebt = event.params._liquidatedDebt;
  liquidation.liquidatedCollateral = event.params._liquidatedColl;
  liquidation.collGasCompensation = event.params._collGasCompensation;
  liquidation.tokenGasCompensation = event.params._LUSDGasCompensation;
  liquidation.ethPrice = priceFeed.lastGoodPrice();
  liquidationCounter.strategyBalance = pool.getDepositorETHGain(
    Address.fromString('0xf33fb13b1cBbCC4Ae28026Ec9a433A1AD6fea172'),
  );

  liquidation.save();

  liquidationCounter.index = liquidationCounter.index.plus(
    BigInt.fromString('1'),
  );
  liquidationCounter.save();
}

export function handleETHGainWithdrawn(_event: ETHGainWithdrawn): void {
  let liquidationCounter = LiquidationCounter.load('0');
  if (liquidationCounter == null) {
    liquidationCounter = new LiquidationCounter('0');
    liquidationCounter.index = BigInt.fromString('0');
  }

  liquidationCounter.save();
}

export function handleDummyEventForGraph(_event: LastGoodPriceUpdated): void {}
