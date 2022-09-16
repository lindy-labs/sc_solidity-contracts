import { Liquidation, LiquidationPriceTracker } from '../types/schema';
import {
  Liquidation as LiquidationEvent,
  LiquityTrove,
} from '../types/LiquityTrove/LiquityTrove';
import {
  ETHGainWithdrawn,
  StabilityPool,
} from '../types/StabilityPool/StabilityPool';
import { LiquityPriceFeed } from '../types/LiquityPriceFeed/LiquityPriceFeed';
import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts';

export function handleLiquidation(event: LiquidationEvent): void {
  let priceTracker = getPriceTracker('0');

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
    // Address.fromString('0x2b1Ce1eF546051d38A8e23917520a7A9C05Da281'), // local
    Address.fromString('0x9043268b2e280dE7DF8AAfe7FEb86e553bd90FdD'), // prod
  );
  liquidation.ethPrice = priceFeed.lastGoodPrice();
  liquidation.highestPrice = priceTracker.highestPrice;

  liquidation.save();
}

export function handleETHGainWithdraw(_event: ETHGainWithdrawn): void {
  let priceTracker = getPriceTracker('0');

  priceTracker.highestPrice = BigInt.fromString('0');

  priceTracker.save();
}

export function trackHighestPrice(block: ethereum.Block): void {
  if (!block.number.mod(BigInt.fromString('50')).equals(BigInt.fromString('0'))) return;

  let priceTracker = getPriceTracker('0');

  if (priceTracker == null) {
    priceTracker = new LiquidationPriceTracker('0');
    priceTracker.highestPrice = BigInt.fromString('0');
  }

  let priceFeed = LiquityPriceFeed.bind(
    // Address.fromString('0x53CbbE1a2cbC42841bdbF2aC855E245f822c768B'), // local
    Address.fromString('0x4c517d4e2c851ca76d7ec94b805269df0f2201de'), // prod
  );
  const priceResult = priceFeed.try_lastGoodPrice();

  if (!priceResult.reverted && priceTracker.highestPrice.lt(priceResult.value)) {
    priceTracker.highestPrice = priceResult.value;
  }

  priceTracker.save();
}

function getPriceTracker(id: string): LiquidationPriceTracker {
  let priceTracker = LiquidationPriceTracker.load('0');

  if (priceTracker == null) {
    priceTracker = new LiquidationPriceTracker('0');
    priceTracker.highestPrice = BigInt.fromString('0');
    priceTracker.save();
  }

  return priceTracker;
}
