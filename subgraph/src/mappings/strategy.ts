import { InitDepositOperation, InitRedeemOperation } from "../types/schema";

import {
  InitDepositStable,
  InitRedeemStable,
} from "../types/Strategy/AnchorUSTStrategy";

export function handleInitDeposit(event: InitDepositStable): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();

  const initDepositOperation = new InitDepositOperation(id);
  initDepositOperation.idx = event.params.idx;
  initDepositOperation.operator = event.params.operator;
  initDepositOperation.underlyingAmount = event.params.underlyingAmount;
  initDepositOperation.ustAmount = event.params.ustAmount;

  initDepositOperation.save();
}

export function handleInitRedeem(event: InitRedeemStable): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();

  const initRedeemOperation = new InitRedeemOperation(id);
  initRedeemOperation.operator = event.params.operator;
  initRedeemOperation.aUstAmount = event.params.aUstAmount;

  initRedeemOperation.save();
}
