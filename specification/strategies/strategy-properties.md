# Strategy Properties

## Liquity

| Property                                                           | Echidna | Formally Verified |
| ------------------------------------------------------------------ | :-----: | :---------------: |
| invest: reverts if msg.sender is not manager                       |    ✓    |                   |
| invest: reverts if underlying balance is zero                      |    ✓    |                   |
| invest: deposits underlying to the stabilityPool                   |    ✓    |                   |
| withdrawToVault: reverts if msg.sender is not manager              |    ✓    |                   |
| withdrawToVault: reverts if amount is zero                         |    ✓    |                   |
| withdrawToVault: reverts if amount is greater than invested assets |    ✓    |                   |
| withdrawToVault: works if amount is less than invested assets      |    ✓    |                   |
| withdrawToVault: works if amount is equal than invested assets     |    ✓    |                   |
| allowSwapTarget: reverts if msg.sender is not settings role        |    ✓    |                   |
| denySwapTarget: reverts if msg.sender is not settings role         |    ✓    |                   |
| reinvest: reverts if msg.sender is not keeper role                 |    ✓    |                   |
