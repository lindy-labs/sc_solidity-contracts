# Properties of LiquityStrategy

## Overview of the LiquityStrategy

The LiquidityStrategy has the following state variables:
*   IERC20 public underlying; // LUSD token
*   address public override(IStrategy) vault;
*   IStabilityPool public stabilityPool;
*   ICurveExchange public curveExchange;
*   IERC20 public lqty; // reward token
*   mapping(address => bool) public allowedSwapTargets; // whitelist of swap targets
*   uint16 public minPrincipalProtectionPct;


Below are quite static global settings, even though they are also state variables:

constructor but can be updated by a *settings* account

The LiquidityStrategy has the following external/public functions that change state variables:

It has the following external/public functions that are privileged and change settings:

It has the following external/public functions that are view only and change nothing:

## Properties

| No. | Property  | Category | Priority | Specified | Verified | Report |
| ---- | --------  | -------- | -------- | -------- | -------- | -------- |