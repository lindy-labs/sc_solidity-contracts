---
description: Lists actions to take in case of an emergency
---

# Emergency Procedures

Got a bug to report? Reach out to us at [engineering@sandclock.org](mailto:engineering@sandclock.org?subject=%5BURGENT%5D%20Bug%20Report).

## Introduction

This document, heavily inspired by Yearn's, details the procedures and guidelines that should take place in the event of an emergency situation. Its purpose is to minimize the risk of loss of funds or bad debt for our users, Treasury, and Smart Contracts.

### Definitions and Examples of Emergencies

For the purposes of this document, an emergency situation is defined to be:

* Any situation that may lead to a considerable amount of loss of funds for our users, Treasury, or Smart Contracts.

This is a non exhaustive list of possible emergency scenarios:

* Bug/Exploit in Sandclock’s code that can cause bad debt and/or a loss of funds for users
* Bug/Exploit in an underlying protocol that Sandclock uses that may lead to loss of funds
* Loss of private keys for a key role, prior to executing the decentralization roadmap
* Potential exploit discovered by team or bounty program researcher
* Bug/Exploit in Sandclock’s frontend allowing an attacker to phish our users
* Active exploit/hack in progress discovered by unknown party

## Roles

In the event of an emergency situation, the following roles should be assigned to the contributors working to resolve the situation. Here we list them and the first choice.

* Facilitator: [Cristiano](https://www.notion.so/Cristiano-Teixeira-048e7e9edfd64a7c90f9c3c587f0e183)
* Multi-sig Herder: [Cristiano](https://www.notion.so/Cristiano-Teixeira-048e7e9edfd64a7c90f9c3c587f0e183)
* Core Dev Lead (Guardian): [Diganta](https://www.notion.so/Diganta-Kalita-d969b5215e104f0aa174931fda851120), [Martin](https://www.notion.so/Martin-Stuessy-9e00375afe694a848a2fd2fd64123f38), [Nenad](https://www.notion.so/Nenad-Milenkovic-d4d9f0e8c9ab430eb1f17b20f78d954a), whoever is available/awake
* Web Lead: N/A (for now)
* Ops: [Cristiano](https://www.notion.so/Cristiano-Teixeira-048e7e9edfd64a7c90f9c3c587f0e183)

A contributor may be assigned up to two of these roles concurrently.

### Facilitator

Facilitates the emergency handling and ensures the process described in this document is followed, engaging with the correct stakeholders and teams in order for the necessary decisions to be made quickly. A suitable Facilitator is any person familiar with the process and is confident that they can drive the team to follow through. It's expected that the person assigned to this role has relevant experience either from having worked real scenarios or through drill training.

### Multi-sig Herder

Responsible for ensuring the relevant Multi-sig wallets are able to execute transactions in a timely manner during the emergency.

Main responsibilities:

* Help clear the queue of any pending operations once the War Room starts
* Coordinate required signers so they can respond quickly to queued transactions
* Prepare or help with transactions in different multi-sigs

### Core Dev Lead (Guardian)

Coordinates quick changes to Governance and Guardian roles during the emergency, including but not limited to:

* Prepare and Execute relevant Multi-sig transactions and operations
* Update key parameters
* Pause deposits by calling `pause()`
  * This mode pauses deposits, and sponsorships
* Set contract to emergency mode by calling `exitPause()`
  * This mode pauses yield claiming, unsponsoring, and withdrawals

### Web Lead

Coordinates quick changes to UI and Websites as required, including but not limited to:

* Disable deposits through the UI
* Display alerts and banners

### Ops

In charge of coordinating comms and operations assistance as required:

* Clear with War Room what information and communication can be published during and after the incident
* Coordinate Communications
* Take note of timelines and events for disclosure

## Emergency Steps

This acts as a guideline to follow when an incident is reported requiring immediate attention.

The primary objective is to minimize the loss of funds, in particular for our users. All decisions made should be driven by this goal.

1. Create a private Slack channel (War Room) and invite only the team members that are online that can cover the roles described above. The War Room is limited to members that act in the capacities of the designated roles, as well as additional individuals that can provide critical insight into the circumstances of the issue and how it can best be resolved.
2. All the information gathered during the War Room should be considered private to the chat and not to be shared with third parties. Relevant data should be pinned and updated by the Facilitator for the team to have handy.
3. The team's first milestone is to assess the situation as quickly as possible: to confirm the reported information and evaluate the incident. A few questions to guide this process:
   * Is there confirmation from several relevant sources that the issue is valid? Are there example transactions that show the incident occurring? (Pin these in the War Room)
   * Is a core developer in the War Room? Can they be reached? If not, can we reach out to other Lindy Labs smart contract developers?
   * Are funds presently at risk? Is immediate action required?
   * Is the issue isolated or does it affect several contracts? Can the affected contracts be identified? (Pin these in the War Room)
   * The Multi-sig Herder should begin to notify signers and clear the queue in preparation for emergency transactions.
   * If there is no immediate risk for loss of funds, does the team still need to take preventive action or some other mitigation?
   * Is there agreement in the team that the situation is under control and that the War Room can be closed?
4. Once the issue has been confirmed as valid, the next stop is to take immediate corrective action to prevent further loss of funds. If root cause requires further research, the team must err on the side of caution and take emergency preventive actions while the situation continues to be assessed. A few questions to guide the decisions of the team.
   * Should we disable deposits from the affected contracts? Should deposits be removed from the UI? If yes, call `pause()`
   * Should we disable withdrawals from the affected contracts? Should withdrawals be removed from the UI? If yes, call `exitPause()`
   * Are multiple Team members able to confirm the corrective actions will stop the immediate risk through local fork testing? Core Dev main role must confirm this step.
5.  The immediate corrective actions should be scripted and executed ASAP. Multi-sig Herder should coordinate this execution within the corresponding roles.

    💡 \*\*NOTE:\*\* This step is meant to give the War Room time to assess and research a more long term solution.
6. Once corrective measures are in place and there is confirmation by multiple sources that funds are no longer at risk, the next objective is to identify the root cause. A few questions/actions during this step that can help the team make decisions:
   * What communications should be made public at this point in time?
   * Can research among members of the War Room be divided? This step can be open for team members to do live debug sessions sharing screens to help identify the problem using the sample transactions.
7. Once the cause is identified, the team can brainstorm to come up with the most suitable remediation plan and its code implementation (if required). A few questions that can help during this time:
   * In case there are many possible solutions, can the team prioritize by weighing each option by time to implement and minimization of losses?
   * Can the possible solutions be tested and compared to confirm the end state fixes the issue?
   * Is there agreement in the War Room about the best solution? If not, can the objections be identified and a path for how to reach consensus on the approach be worked out, prioritizing the minimization of losses?
   * If a solution will take longer than a few hours, are there any further communications and preventive actions needed while the fix is developed?
   * Does the solution require a longer term plan? Have we identified owners for the tasks/steps for the plan's execution?
8. Once a solution has been implemented, the team will confirm the solution resolves the issue and minimizes the loss of funds. Possible actions needed during this step:
   * Run fork simulations of end state to confirm the proposed solution(s)
   * Coordinate signatures from multi-sig signers and execution
   * Enable UI changes to normalize operations as needed
9. Assign a lead to prepare a disclosure (should it be required), preparing a timeline of the events that took place.
10. The team agrees when the War Room can be dismantled. The Facilitator breaks down the War Room and sets reminders if it takes longer than a few hours for members to reconvene.

### Emergency Checklist

This checklist should be complemented with the steps

1. Create War room with audio
2. Assign Key Roles to War Room members
3. Add Core Dev (or their backup) to the War Room
4. Clear related Multi-sig queues
5. Disable deposits and withdrawals as needed
6. Check if share price has been artificially lowered
7. Confirm and identify Issue
8. Take immediate corrective/preventive actions in order to prevent (further) loss of funds
9. Communicate the current situation internally and externally (as appropriate)
10. Determine the root cause
11. Propose workable solutions
12. Implement and validate solutions
13. Prioritize solutions
14. Reach agreement with Team regarding the best solution
15. Execute solution
16. Confirm incident has been resolved
17. Assign ownership of security disclosure report
18. Disband War Room
19. Conduct immediate debrief
20. Schedule a Post Mortem

### Tools

| Description         | Primary     | Secondary         |
| ------------------- | ----------- | ----------------- |
| Code Sharing        | GitHub      | HackMD, CodeShare |
| Communications      | Slack       | N/A               |
| Transaction Details | Etherscan   | EthTxInfo         |
| Debugging           | Brownie     | Tenderly          |
| Transaction Builder | ape-safe    |                   |
| Screen Sharing      | Google Meet | jitsi             |

The Facilitator is responsible to ensure no unauthorized persons enter the War Room or join these tools via invite links that leak.

## Incident Post Mortem

A Post Mortem should be conducted after an incident to gather data and feedback from War Room participants in order to produce actionable improvements for our processes such as this one.

Following the dissolution of a War Room, the Facilitator should ideally conduct an immediate informal debrief to gather initial notes before they are forgotten by participants.

This can then be complemented by a more extensive Post Mortem as outlined below.

The Post Mortem should be conducted at the most a week following the incident to ensure a fresh recollection by the participants.

It is key that most of the participants of the War Room are involved during this session in order for an accurate assessment of the events that took place. Discussion is encouraged. The objective is to collect constructive feedback for how the process can be improved, and not to assign blame to any War Room participants.

Participants are encouraged to provide inputs on each of the steps. If a participant does not, the Facilitator is expected to try to obtain more feedback by asking probing questions.

### Post Mortem Outputs

* List what went well
* List what be improved
* List questions that came up in the Post Mortem
* List insights from the process
* Root Cause Analysis along with concrete measures required to prevent the incident from ever happening again.
* List of action items assigned to owners with estimates for completion.

### Post Mortem Steps

1. Facilitator runs the session in a voice channel and shares their screen for participants to follow notes.
2. Facilitator runs through an agenda to obtain the necessary post-mortem outputs.
3. For the Root Cause Analysis part, the Facilitator conducts an exercise to write the problem statement first and then confirm with the participants that the statement is correct and understood.
4. Root Cause Analysis can be identified with following tools:

* Brainstorming session with participants
* [The 5 Whys Technique](https://en.wikipedia.org/wiki/Five\_whys)

1. Once Root Causes have been identified, action items can be written and assigned to willing participants that can own the tasks. It is recommended that an estimated time for completion is given. A later process can track completion of given assignments. **Note: The action items need to be clear, actionable and measurable for completion**
2. The Facilitator tracks completion of action items. The end result of the process should be an actionable improvement in the process. Some possible improvements:

* Changes in the process and documentation
* Changes in code and tests to validate
* Changes in tools implemented and incorporated into the process
