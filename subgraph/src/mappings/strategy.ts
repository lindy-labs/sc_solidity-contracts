import { store } from "@graphprotocol/graph-ts";
import { DepositOperation, RedeemOperation } from "../types/schema";
import {
  FinishDepositStable,
  FinishRedeemStable,
  InitDepositStable,
  InitRedeemStable,
} from "../types/Strategy/AnchorUSTStrategy";

export function handleInitDeposit(event: InitDepositStable): void {
  const id = event.params.operator.toHexString();

  const depositOperation = new DepositOperation(id);

  depositOperation.idx = event.params.idx;
  depositOperation.underlyingAmount = event.params.underlyingAmount;
  depositOperation.ustAmount = event.params.ustAmount;

  depositOperation.save();
}

export function handleFinishDeposit(event: FinishDepositStable): void {
  const id = event.params.operator.toHexString();

  store.remove("DepositOperation", id);
}

export function handleInitRedeem(event: InitRedeemStable): void {
  const id = event.params.operator.toHexString();

  const redeemOperation = new RedeemOperation(id);
  redeemOperation.aUstAmount = event.params.aUstAmount;

  redeemOperation.save();
}

export function handleFinishRedeem(event: FinishRedeemStable): void {
  const id = event.params.operator.toHexString();

  store.remove("RedeemOperation", id);
}
