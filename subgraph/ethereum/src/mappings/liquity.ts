import { Address, BigInt, ethereum, log } from '@graphprotocol/graph-ts';

import { Vault, Liquidation, LiquidationState } from '../types/schema';
import {
  Liquidation as LiquidationEvent,
  LiquityTrove,
} from '../types/LiquityTrove/LiquityTrove';
import {
  ETHGainWithdrawn,
  StabilityPool,
} from '../types/StabilityPool/StabilityPool';
import { LiquityPriceFeed } from '../types/LiquityPriceFeed/LiquityPriceFeed';

import { createVault } from './helpers';

export function handleLiquidation(event: LiquidationEvent): void {
  const vault = createVault();

  if (!vault.strategy) return;

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
    Address.fromBytes(vault.strategy!),
  );
  liquidation.ethPrice = priceFeed.lastGoodPrice();
  liquidation.highestPrice = priceTracker.highestPrice;

  liquidation.save();
}

export function handleETHGainWithdrawn(event: ETHGainWithdrawn): void {
  const vault = createVault();

  if (!vault.strategy) return;

  if (event.params._depositor != Address.fromBytes(vault.strategy!)) return;

  let priceTracker = getPriceTracker('0');

  priceTracker.highestPrice = BigInt.fromString('0');

  priceTracker.save();
}

export function trackHighestPrice(block: ethereum.Block): void {
  // if (!block.number.mod(BigInt.fromString('50')).equals(BigInt.fromString('0'))) return;

  let priceTracker = getPriceTracker('0');

  let priceFeed = LiquityPriceFeed.bind(
    Address.fromString('0x53CbbE1a2cbC42841bdbF2aC855E245f822c768B'), // local
    // Address.fromString('0x4c517d4e2c851ca76d7ec94b805269df0f2201de'), // prod
  );
  const priceResult = priceFeed.try_lastGoodPrice();

  if (
    !priceResult.reverted &&
    priceTracker.highestPrice.lt(priceResult.value)
  ) {
    priceTracker.highestPrice = priceResult.value;
  }

  priceTracker.save();
}

function getPriceTracker(id: string): LiquidationState {
  let priceTracker = LiquidationState.load('0');

  if (priceTracker == null) {
    priceTracker = new LiquidationState('0');
    priceTracker.highestPrice = BigInt.fromString('0');
    priceTracker.save();
  }

  return priceTracker;
}
