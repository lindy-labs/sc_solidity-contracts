import { DepositOperation, RedeemOperation } from "../types/schema";

import {
  InitDepositStable,
  InitRedeemStable,
} from "../types/Strategy/AnchorUSTStrategy";

export function handleInitDeposit(event: InitDepositStable): void {
  const id = event.params.operator.toString();

  const depositOperation = new DepositOperation(id);

  depositOperation.idx = event.params.idx;
  depositOperation.underlyingAmount = event.params.underlyingAmount;
  depositOperation.ustAmount = event.params.ustAmount;
  depositOperation.finished = false;

  depositOperation.save();
}

export function handleFinishDeposit(event: InitDepositStable): void {
  const id = event.params.operator.toString();

  const depositOperation = new DepositOperation(id)!;
  depositOperation.finished = true;

  depositOperation.save();
}

export function handleInitRedeem(event: InitRedeemStable): void {
  const id = event.params.operator.toString();

  const redeemOperation = new RedeemOperation(id);
  redeemOperation.aUstAmount = event.params.aUstAmount;
  redeemOperation.finished = false;

  redeemOperation.save();
}

export function handleFinishRedeem(event: InitRedeemStable): void {
  const id = event.params.operator.toString();

  const redeemOperation = RedeemOperation.load(id)!;
  redeemOperation.finished = true;

  redeemOperation.save();
}
