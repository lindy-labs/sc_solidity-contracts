// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import {
  ethereum,
  JSONValue,
  TypedMap,
  Entity,
  Bytes,
  Address,
  BigInt
} from "@graphprotocol/graph-ts";

export class Sponsored extends ethereum.Event {
  get params(): Sponsored__Params {
    return new Sponsored__Params(this);
  }
}

export class Sponsored__Params {
  _event: Sponsored;

  constructor(event: Sponsored) {
    this._event = event;
  }

  get id(): BigInt {
    return this._event.parameters[0].value.toBigInt();
  }

  get amount(): BigInt {
    return this._event.parameters[1].value.toBigInt();
  }

  get depositor(): Address {
    return this._event.parameters[2].value.toAddress();
  }

  get lockedUntil(): BigInt {
    return this._event.parameters[3].value.toBigInt();
  }
}

export class Unsponsored extends ethereum.Event {
  get params(): Unsponsored__Params {
    return new Unsponsored__Params(this);
  }
}

export class Unsponsored__Params {
  _event: Unsponsored;

  constructor(event: Unsponsored) {
    this._event = event;
  }

  get id(): BigInt {
    return this._event.parameters[0].value.toBigInt();
  }

  get amount(): BigInt {
    return this._event.parameters[1].value.toBigInt();
  }

  get to(): Address {
    return this._event.parameters[2].value.toAddress();
  }

  get burned(): boolean {
    return this._event.parameters[3].value.toBoolean();
  }
}

export class IVaultSponsoring extends ethereum.SmartContract {
  static bind(address: Address): IVaultSponsoring {
    return new IVaultSponsoring("IVaultSponsoring", address);
  }

  totalSponsored(): BigInt {
    let result = super.call("totalSponsored", "totalSponsored():(uint256)", []);

    return result[0].toBigInt();
  }

  try_totalSponsored(): ethereum.CallResult<BigInt> {
    let result = super.tryCall(
      "totalSponsored",
      "totalSponsored():(uint256)",
      []
    );
    if (result.reverted) {
      return new ethereum.CallResult();
    }
    let value = result.value;
    return ethereum.CallResult.fromValue(value[0].toBigInt());
  }
}

export class PartialUnsponsorCall extends ethereum.Call {
  get inputs(): PartialUnsponsorCall__Inputs {
    return new PartialUnsponsorCall__Inputs(this);
  }

  get outputs(): PartialUnsponsorCall__Outputs {
    return new PartialUnsponsorCall__Outputs(this);
  }
}

export class PartialUnsponsorCall__Inputs {
  _call: PartialUnsponsorCall;

  constructor(call: PartialUnsponsorCall) {
    this._call = call;
  }

  get _to(): Address {
    return this._call.inputValues[0].value.toAddress();
  }

  get _ids(): Array<BigInt> {
    return this._call.inputValues[1].value.toBigIntArray();
  }

  get _amounts(): Array<BigInt> {
    return this._call.inputValues[2].value.toBigIntArray();
  }
}

export class PartialUnsponsorCall__Outputs {
  _call: PartialUnsponsorCall;

  constructor(call: PartialUnsponsorCall) {
    this._call = call;
  }
}

export class SponsorCall extends ethereum.Call {
  get inputs(): SponsorCall__Inputs {
    return new SponsorCall__Inputs(this);
  }

  get outputs(): SponsorCall__Outputs {
    return new SponsorCall__Outputs(this);
  }
}

export class SponsorCall__Inputs {
  _call: SponsorCall;

  constructor(call: SponsorCall) {
    this._call = call;
  }

  get _inputToken(): Address {
    return this._call.inputValues[0].value.toAddress();
  }

  get _amount(): BigInt {
    return this._call.inputValues[1].value.toBigInt();
  }

  get _lockedUntil(): BigInt {
    return this._call.inputValues[2].value.toBigInt();
  }

  get _slippage(): BigInt {
    return this._call.inputValues[3].value.toBigInt();
  }
}

export class SponsorCall__Outputs {
  _call: SponsorCall;

  constructor(call: SponsorCall) {
    this._call = call;
  }
}

export class UnsponsorCall extends ethereum.Call {
  get inputs(): UnsponsorCall__Inputs {
    return new UnsponsorCall__Inputs(this);
  }

  get outputs(): UnsponsorCall__Outputs {
    return new UnsponsorCall__Outputs(this);
  }
}

export class UnsponsorCall__Inputs {
  _call: UnsponsorCall;

  constructor(call: UnsponsorCall) {
    this._call = call;
  }

  get _to(): Address {
    return this._call.inputValues[0].value.toAddress();
  }

  get _ids(): Array<BigInt> {
    return this._call.inputValues[1].value.toBigIntArray();
  }
}

export class UnsponsorCall__Outputs {
  _call: UnsponsorCall;

  constructor(call: UnsponsorCall) {
    this._call = call;
  }
}
