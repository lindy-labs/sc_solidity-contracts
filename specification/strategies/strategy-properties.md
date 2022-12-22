# Strategy Properties

## Liquity

| Property                                                                 | Echidna | Formally Verified |
| ------------------------------------------------------------------------ | :-----: | :---------------: |
| invest: reverts if msg.sender is not manager                             |    ✓    |         ✓         |
| invest: reverts if underlying balance is zero                            |    ✓    |                   |
| invest: deposits underlying to the stabilityPool                         |    ✓    |         ✓         |
| withdrawToVault: reverts if msg.sender is not manager                    |    ✓    |         ✓         |
| withdrawToVault: reverts if amount is zero                               |    ✓    |                   |
| withdrawToVault: reverts if amount is greater than invested assets       |    ✓    |                   |
| withdrawToVault: works if amount is less than invested assets            |    ✓    |         ✓         |
| withdrawToVault: works if amount is equal than invested assets           |    ✓    |         ✓         |
| allowSwapTarget: reverts if msg.sender is not settings role              |    ✓    |         ✓         |
| allowSwapTarget: add \_swapTarget to allowedSwapTargets.                 |         |         ✓         |
| denySwapTarget: reverts if msg.sender is not settings role               |    ✓    |         ✓         |
| denySwapTarget: remove \_swapTarget from allowedSwapTargets.             |         |         ✓         |
| setMinPrincipalProtectionPct: reverts if msg.sender is not settings role |    ✓    |         ✓         |
| reinvest: reverts if msg.sender is not keeper role                       |    ✓    |         ✓         |
| initialize: can be called only once                                      |         |         ✓         |
| harvest: claim ETH and LQTY rewards from stability pool                  |         |         ✓         |
| investedAssets() > 0 <=> hasAssets()                                     |         |         ✓         |
| isSync() == true                                                         |         |         ✓         |
| transferAdminRights: reverts if msg.sender is not admin.                 |         |         ✓         |
| transferAdminRights: transfer admin rights to the new admin              |         |         ✓         |

## Rysk

| Property                                                                 | Echidna | Formally Verified |
| ------------------------------------------------------------------------ | :-----: | :---------------: |
| invest: reverts if msg.sender is not manager                             |         |         ✓         |
| invest: reverts if underlying balance is zero                            |         |         ✓         |
| invest: deposits underlying to the ryskLqPool.                           |         |         ✓         |
| withdrawToVault: reverts if msg.sender is not manager                    |         |         ✓         |
| withdrawToVault: reverts if amount is zero                               |         |         ✓         |
| withdrawToVault: initiate withdraw from the ryskLqPool if amount > 0     |         |         ✓         |
| completeWithdrawal: reverts if msg.sender is not keeper                  |         |         ✓         |
| completeWithdrawal: withdraw underlying from the ryskLqPool to vault     |         |         ✓         |
| investedAssets() > 0 <=> hasAssets()                                     |         |         ✓         |
| isSync() == false                                                        |         |         ✓         |
| transferAdminRights: reverts if msg.sender is not admin.                 |         |         ✓         |
| transferAdminRights: transfer admin rights to the new admin              |         |         ✓         |


