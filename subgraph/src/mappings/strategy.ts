import { DepositOperation, RedeemOperation } from "../types/schema";
import { log } from "@graphprotocol/graph-ts";

import {
  InitDepositStable,
  InitRedeemStable,
} from "../types/Strategy/AnchorUSTStrategy";

export function handleInitDeposit(event: InitDepositStable): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();

  const depositOperation = new DepositOperation(id);

  depositOperation.idx = event.params.idx;
  depositOperation.operator = event.params.operator;
  depositOperation.underlyingAmount = event.params.underlyingAmount;
  depositOperation.ustAmount = event.params.ustAmount;
  depositOperation.init = true;

  depositOperation.save();
}

export function handleInitRedeem(event: InitRedeemStable): void {
  const id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();

  const redeemOperation = new RedeemOperation(id);
  redeemOperation.operator = event.params.operator;
  redeemOperation.aUstAmount = event.params.aUstAmount;

  redeemOperation.save();
}
