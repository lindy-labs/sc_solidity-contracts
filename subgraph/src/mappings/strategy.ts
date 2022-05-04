import { store } from "@graphprotocol/graph-ts";
import { DepositOperation, RedeemOperation } from "../types/schema";
import {
  FinishDepositStable,
  FinishRedeemStable,
  InitDepositStable,
  InitRedeemStable,
  RearrangeDepositOperation,
  RearrangeRedeemOperation,
} from "../types/Strategy/AnchorStrategy";

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

export function handleRearrangeDeposit(event: RearrangeDepositOperation): void {
  const fromId = event.params.operatorFrom.toHexString();
  const fromDeposit = DepositOperation.load(fromId)!;

  const toId = event.params.operatorTo.toHexString();
  const toDeposit = DepositOperation.load(toId)!;

  fromDeposit.idx = toDeposit.idx;

  fromDeposit.save();
}

export function handleInitRedeem(event: InitRedeemStable): void {
  const id = event.params.operator.toHexString();

  const redeemOperation = new RedeemOperation(id);
  redeemOperation.aUstAmount = event.params.aUstAmount;
  redeemOperation.idx = event.params.idx;

  redeemOperation.save();
}

export function handleFinishRedeem(event: FinishRedeemStable): void {
  const id = event.params.operator.toHexString();

  store.remove("RedeemOperation", id);
}

export function handleRearrangeRedeem(event: RearrangeRedeemOperation): void {
  const fromId = event.params.operatorFrom.toHexString();
  const fromRedeem = RedeemOperation.load(fromId)!;

  const toId = event.params.operatorTo.toHexString();
  const toRedeem = RedeemOperation.load(toId)!;

  fromRedeem.idx = toRedeem.idx;

  fromRedeem.save();
}
