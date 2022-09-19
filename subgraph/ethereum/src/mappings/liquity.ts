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

  // bind the contract to the address that emitted the event
  let trove = LiquityTrove.bind(event.address);
  let pool = StabilityPool.bind(trove.stabilityPool());
  let priceFeed = LiquityPriceFeed.bind(trove.priceFeed());

  let liquidationState = getLiquidationState();
  liquidationState.priceFeed = trove.priceFeed();
  liquidationState.save();

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
  liquidation.highestPrice = liquidationState.highestPrice;

  liquidation.save();
}

export function handleETHGainWithdrawn(event: ETHGainWithdrawn): void {
  const vault = createVault();

  if (!vault.strategy) return;

  if (event.params._depositor != Address.fromBytes(vault.strategy!)) return;

  let liquidationState = getLiquidationState();

  liquidationState.highestPrice = BigInt.fromString('0');

  liquidationState.save();
}

export function trackHighestPrice(_block: ethereum.Block): void {
  // if (!block.number.mod(BigInt.fromString('50')).equals(BigInt.fromString('0'))) return;

  const liquidationState = getLiquidationState();

  if (!liquidationState.priceFeed) return;

  const priceFeed = LiquityPriceFeed.bind(
    Address.fromBytes(liquidationState.priceFeed!),
  );

  const priceResult = priceFeed.try_lastGoodPrice();

  if (
    !priceResult.reverted &&
    liquidationState.highestPrice.lt(priceResult.value)
  ) {
    liquidationState.highestPrice = priceResult.value;
  }

  liquidationState.save();
}

function getLiquidationState(): LiquidationState {
  let liquidationState = LiquidationState.load('0');

  if (liquidationState == null) {
    liquidationState = new LiquidationState('0');
    liquidationState.highestPrice = BigInt.fromString('0');
    liquidationState.save();
  }

  return liquidationState;
}
