# Demo script (≤ 3 min)

The spoken phrases are in English, exactly as they are said. All of them are in `test/golden/`.

## Before recording

- [ ] Reseed right before. Against AWS, `npm run seed -- --reset` with `COUNTERPART_ALLOW_REMOTE_RESET=1` deletes and reseeds only the demo businesses; the table and the tokens already issued stay. The command: `npx cross-env COUNTERPART_STORE=dynamo COUNTERPART_ALLOW_REMOTE_RESET=1 npm run seed -- --reset`, with `AWS_PROFILE` and `AWS_REGION` exported. With a fresh seed, the two-minute repeated-order window has no effect.
- [ ] The three Saturday cakes show up no matter which day you seed, because their due dates are pinned to the day of the week.
- [ ] Reports use the business date (Chicago). Recording at any hour no longer moves payments to another day.
- [ ] "How did we do this week compared to last week?" compares the current (incomplete) week against the previous full week: mid-week it will say "down". Record it at the end of the week or adjust the phrase.
- [ ] Try each phrase once against the bridge before recording.
- [ ] If Counterpart was redeployed, leave the Skills unused for 20 minutes before recording, or check that the bridge already reconnects (friction log §15).
- [ ] If rehearsals had errors, clear the agent memory before recording (its failed answers are rehydrated in old containers; friction log §16). For each memory, with `MemoryId` taken from the bridge's `cdk-outputs.json`: `aws bedrock-agentcore list-actors`, then `list-sessions` and `list-events` → `delete-event` per event, and `list-memory-records` in `/users/<actor>/preferences` and `/users/<actor>/sessions/<session>` → `delete-memory-record`.
- [ ] Open both Skills once before recording: the first turn after a while wakes AgentCore and may say "I'm still starting up".

## Script

1. **0:00–0:20 · The problem.** A mechanic under a car, hands busy; the system is on a PC at the back of the shop.
2. **0:20–1:30 · The shop by voice.**
   - *"What's waiting on parts?"*
   - *"Add front brake pads to the blue sedan"*
   - *"Move the blue sedan into the bay"*
   - *"Close out the silver crossover, they paid by card"* — uses Nina Patel's crossover, which is seeded ready for pickup.
3. **1:30–1:55 · The visuals.** *"How's the shop looking today?"* and *"How did we do this week compared to last week?"*, showing the two MCP Apps UIs. They are presented as the interface Alexa+ shows on devices with a screen, without passing them off as an Alexa+ capture.
4. **1:55–2:35 · A new business, set up by talking.** "Petal and Stem" starts blank (`npm run business:new -- florist "Petal and Stem" --reset` before recording).
   - *"Open petal and stem"* → *"I run a flower shop. We take orders for bouquets and centerpieces, arrange them, and they're ready for pickup or delivery."*
   - Wait about 15 s and *"What did you come up with?"*, with the basic-host draft screen as an insert.
   - *"Yes, turn it on"* → in the same conversation: *"Take an order for Maria Lopez, a dozen roses for Friday"* → *"What bouquet orders are due Friday?"* (the nouns come from Nova's draft: check them before recording).
   - The bakery stays as a second profile in the diagram and in the Devpost text.
5. **2:35–3:00 · How it's built.** The diagram from `docs/aws-builder.md` (ECS Express Mode, DynamoDB, Secrets Manager, Bedrock AgentCore with Nova 2 Lite) and the close: one engine, any business that takes orders.
