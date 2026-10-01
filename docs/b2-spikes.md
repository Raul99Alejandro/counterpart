# Plan B2 spikes

Results of the spikes in B2 spec §4.2. No account data: no number, no ARNs, no URLs.

## S1 — Counterpart on ECS Express Mode
- **It works.** `npm run deploy` creates ECR, the table, the logs, three roles and the service. The remote smoke test passes 6/6 (ping, 401 without token, `2025-11-25`, nine tools, speakable summary, another business's session → 404).
- **SSE stream:** an idle `GET /mcp` is still alive after 90 s through the load balancer. No keep-alive is needed for Stage 1.
- **Endpoint:** Express Mode assigns a `<id>.ecs.us-east-1.on.aws` hostname when the service is created, and the load balancer rule filters on that hostname. The infrastructure policy is called `AmazonECSInfrastructureRoleforExpressGatewayServices`.
- **Three snags, already fixed in `infra/deploy.sh`:**
  1. Git Bash converts `/ecs/counterpart` into a Windows path → `MSYS_NO_PATHCONV=1` and local `D:/...` paths.
  2. `aws iam list-policies` applies `--query` page by page and returns one `None` per page → the first `arn:` line is taken.
  3. **The first update after creating the service failed** with *"productionListenerRule should have exactly one target group serving traffic but found 2"* and rolled back. The rollback left the load balancer rule at **950/50** between two target groups, with 95% going to one **with no tasks**: the URL answered 503 most of the time and every later update failed the same way. It was repaired by hand with `aws elbv2 modify-rule`, with weights 999/0 toward the healthy target group; after that the update went through. The script now checks that `/mcp` answers 401 and retries, but **that does not repair a stuck rule**.
- **Teardown tested:** `npm run teardown -- --yes --keep-data` deleted the service, load balancer, target groups, ECR, logs and roles, and its check came out clean. Redeploying from scratch worked and the smoke test passed 6/6 again.
- On the redeploy, the first update did **not** get stuck: snag 3 is not systematic. **The hostname changes on every deploy from scratch**, so after a teardown without `--keep-data` (or with it) `BRIDGE_MCP_URL` must be updated in the bridges.
- An Express Mode deploy (canary plus observation) can take longer than the 10 minutes of the CLI's `services-stable` waiter; the script waits up to 30.

## S2 — Two bridge deployments in one account
Reviewed on `KayLerch/alexa-skill-mcp-bridge` at `ca2c2ef`, without deploying anything.

- Files that fix the stack name:
  - `infra/bin/app.ts`: the stack id, `'AlexaMcpBridgeStack'`.
  - `scripts/lib.ts`: `export const STACK_NAME = 'AlexaMcpBridgeStack'`, used by `scripts/deploy.ts` (deploy and `cdk-outputs.json`), `scripts/destroy.ts` (destroy and the assets file) and `readOutputs()`.
  - `packages/cli/src/remote.ts`: reads `outputs.AlexaMcpBridgeStack?.RuntimeArn` for `npm run chat -- --remote`.
- Resources with a fixed physical name: in `infra/lib/alexa-mcp-bridge-stack.ts`, AgentCore Memory `memoryName: 'alexa_mcp_bridge'` and AgentCore Runtime `runtimeName: 'alexa_mcp_bridge'`. With `features.gateway` on, also `gatewayName: 'alexa-mcp-bridge'` (off by default and in Counterpart). The other resources (Lambda, roles, logs) take CDK-generated names based on the stack id.
- `cdk synth` on Windows spent more than 10 minutes preparing the agent image asset (the context is the repo root); it was stopped and the names were taken from the stack code.
- Decision: the Task 8 patch carries **three** changes: (1) stack name from `BRIDGE_STACK_NAME` in `infra/bin/app.ts`, `scripts/lib.ts` and `packages/cli/src/remote.ts`; (2) `BRIDGE_INVOCATION_NAME` as an override of `skill.invocationName`; (3) `memoryName`, `runtimeName` and `gatewayName` derived from the stack name when it is not the default, so two deployments don't collide.

## S3 — Free-form phrases with tools that change after deployment
- **The catch-all works.** `npm run generate` creates `SpokenRequestIntent`, which passes the whole phrase to the agent. Phrases that are not in the voice model ("move the civic into the bay", "close out the cx-5 they paid by card") reached the agent and it picked the right tool: all 11 script phrases pass by voice in the simulator.
- **The tool list is cached per MCP client, not per turn.** `BridgeMcpClient` stores `tools` on connect and only clears it on reconnect. The client lives as long as the AgentCore container, and **one container serves several sessions**. The bridge does not listen for `notifications/tools/list_changed`.
- **Decision for Stage 2:** activating a blank business cannot count on the agent seeing the nine tools in the same session. Either the fork clears the tool cache on `tools/list_changed` (small change, with a test), or the activation response asks to reopen the Skill **and** the server closes the MCP session to force a reconnect (the 404 already triggers a reconnect and a re-read of the tools). To be decided when writing the Stage 2 plan.
- **Findings while testing:**
  1. AgentCore kept sending new sessions to containers from earlier runtime versions until they reached their 8 h lifetime (friction log §15).
  2. The agent memory rehydrated failed answers from earlier sessions, and Nova stopped calling tools (friction log §16).

## S4 — Latency of a draft with Nova 2 Lite
- 10 runs of `infra/spikes/nova-latency.ts` (forced tool use, reduced profile and catalog schema): **p50 1423 ms, p95 3300 ms**. The slowest run was the first (cold); the other nine were between 1.3 and 1.6 s. All 10 returned tool use.
- The real schema (full profile plus a catalog of up to 60 items) generates much more output than this one, so its latency will be higher.
- Decision for Stage 2: **asynchronous**, as B2 spec §5.3 says. The p95 is already over 3 s with the reduced schema, and the bridge gives 6.5 s per turn to the whole agent, not just to the tool.
