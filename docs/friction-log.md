# Friction log

Problems we hit while building Counterpart, in the order we hit them. Each entry says what happened, what it cost, and what would have helped.

## 1. The Alexa+ MCP Toolkit CLI is not installable

- **Area:** Alexa+ MCP Toolkit, `@alexa-ai/cli`
- **What happened:** The quickstart installs the CLI with `npm install -g @alexa-ai/cli`. On the public npm registry that package returns 404. The setup guide mentions an AWS CodeArtifact registry in `us-west-2`, which only allowlisted accounts can read, and there is no self-serve way to request access.
- **Impact:** We could not onboard our MCP server to Alexa+ or use the Alexa+ web simulator. We built the server to the Alexa+ requirements anyway and planned the voice demo around an Alexa Skill bridge that emulates the orchestrator.
- **Suggestion:** For a global hackathon with an Alexa+ track, publish the CLI (or a sandbox) to participants, or state the access requirement on the track page before people start building.

## 2. The CLI does not support Windows and needs Node 24

- **Area:** Alexa AI CLI setup guide
- **What happened:** Supported systems are macOS and Ubuntu, and Node.js 24 or later is required.
- **Impact:** Windows developers need WSL or a container just for the CLI.
- **Suggestion:** Support Windows, or document a ready-made container image for the CLI.

## 3. The Toolkit is US-only

- **Area:** Alexa+ MCP Toolkit
- **What happened:** The Toolkit overview says it is available in the United States. The hackathon is open to all countries.
- **Impact:** Participants outside the US cannot tell up front whether they can test an Alexa+ add-on at all.
- **Suggestion:** Say on the track page what non-US participants can and cannot test.

## 4. Amazon Cognito omits `code_challenge_methods_supported`

- **Area:** Alexa+ account linking with Amazon Cognito
- **What happened:** Alexa+ account linking blocks deployment unless the authorization server advertises PKCE `S256`. Cognito supports PKCE but no longer lists `code_challenge_methods_supported` in its OpenID discovery document.
- **Impact:** Cognito, the obvious AWS choice, fails the deploy-time check as-is. The workaround is to serve your own authorization-server metadata that adds the field and points at Cognito's endpoints.
- **Suggestion:** Document this workaround in the account linking guide, or have the check accept Cognito.

## 5. AWS App Runner is closed to new customers

- **Area:** Hosting on AWS
- **What happened:** App Runner, the simplest way to run a container behind HTTPS, stopped accepting new customers on April 30, 2026. The replacement is ECS Express Mode.
- **Impact:** Guides and community examples that use App Runner no longer work for new accounts.
- **Suggestion:** Point hackathon resources at ECS Express Mode.

## 6. Spreading a `Headers` object silently drops headers

- **Area:** MCP TypeScript SDK v2 client, custom `fetch`
- **What happened:** To add an `Authorization` header we wrapped `fetch` and spread `init.headers`. The SDK passes a `Headers` instance, and spreading it yields `{}`, which dropped the SDK's own `Accept` header. The server answered 406.
- **Impact:** An hour on a misleading status code.
- **Suggestion:** Surface `StreamableHTTPClientTransportOptions.requestInit` (a first-class way to add headers without wrapping `fetch`) and the `new Headers(init?.headers)` pattern in the client README — today both live only in the type declarations' JSDoc (`@modelcontextprotocol/client/dist/index.d.mts`), not in `README.md`.

## 7. `allowedHosts` is undocumented outside the type declarations

- **Area:** MCP TypeScript SDK v2 server, `createMcpExpressApp`
- **What happened:** Binding to `0.0.0.0` logs "Server is binding to 0.0.0.0 without DNS rebinding protection. Consider using the allowedHosts option to restrict allowed hosts, or use authentication to protect your server." The only `allowedHosts` example we found is a JSDoc `@example` in the type declarations (`@modelcontextprotocol/express/dist/index.d.mts`) — `createMcpExpressApp({ host: '0.0.0.0', allowedHosts: ['myapp.local', 'localhost'] })` — not in the package's README, and it uses fixed local hostnames rather than a hostname a load balancer assigns at deploy time.
- **Impact:** We had to read the type declarations to find the option at all, then work out ourselves what to put in `allowedHosts` for a container behind a load balancer.
- **Suggestion:** Document `allowedHosts` in the README, including the load-balancer case.

## 8. The AWS Free plan excludes AgentCore and hackathon credits

- **Area:** AWS account plans
- **What happened:** A new account starts on the Free plan. The AWS Free Tier page marks Amazon Bedrock AgentCore as "Paid plan exclusive", and the plan documentation says Free plan accounts "are not eligible for other promotional credits". The Alexa bridge runs its agent on AgentCore, and the hackathon's $150 arrive as a promotional code.
- **Impact:** Both the voice demo and the hackathon credits depend on upgrading to the Paid plan, which the hackathon resources page doesn't mention.
- **Suggestion:** Say on the hackathon resources page that participants need the Paid plan to redeem the credits and to use AgentCore.

## 9. Nova 2 Lite only answers through an inference profile

- **Area:** Amazon Bedrock, Converse API
- **What happened:** `converse --model-id amazon.nova-2-lite-v1:0` fails with `ValidationException: Invocation of model ID amazon.nova-2-lite-v1:0 with on-demand throughput isn't supported`. The model ID appears in the us-east-1 catalog as is; only the cross-region profiles `us.amazon.nova-2-lite-v1:0` and `global.amazon.nova-2-lite-v1:0` work.
- **Impact:** Small, but the error names the fix only indirectly, and the catalog ID is the obvious thing to try first.
- **Suggestion:** Show the inference profile ID next to the model ID in the model catalog, and name the profile to use in the error message.

## 10. `allowedHosts` also guards the health check

- **Area:** MCP TypeScript SDK v2 server, `createMcpExpressApp`
- **What happened:** `createMcpExpressApp({ allowedHosts })` mounts Host validation on the whole Express app. A load balancer's health check calls `/ping` with the task's private IP as `Host`, gets 403, and the task never turns healthy.
- **Impact:** Using the option the way entry 7 suggests would have taken the service down on its first deploy. We mount `hostHeaderValidation` on `/mcp` only instead.
- **Suggestion:** Scope the validation to the MCP route, or document that non-MCP routes behind a load balancer need to be excluded.

## 11. The Alexa bridge deploys one Skill per account

- **Area:** `alexa-skill-mcp-bridge`
- **What happened:** The CDK stack name `AlexaMcpBridgeStack` is fixed in `infra/bin/app.ts`, `scripts/lib.ts` and `packages/cli/src/remote.ts`, and the invocation name lives in the tracked `bridge.config.ts`. A second deploy for our second business would update the first one.
- **Impact:** One Alexa Skill per business, the way each business would install its own Alexa+ add-on, needed a fork that reads both names from `.env`.
- **Suggestion:** Read the stack name and the invocation name from `.env`, like the MCP URL.

## 12. An Express Mode rollback left traffic on an empty target group

- **Area:** Amazon ECS Express Mode
- **What happened:** The first update after creating the service failed with "productionListenerRule … should have exactly one target group serving traffic but found 2" and rolled back. The rollback left the listener rule weighted 950/50, with 95% of traffic on a target group that had no tasks. The public URL answered 503 most of the time, and every later update failed with the same error.
- **Impact:** About an hour. We found it only by reading the listener rule's weights, and fixed it with `aws elbv2 modify-rule` (999/0 toward the healthy target group). A redeploy from scratch later did not reproduce it.
- **Suggestion:** Restore the weights on rollback, and name the listener rule and its weights in the service event.

## 13. The bridge's scripts could not start `npx` or `ask` on Windows

- **Area:** `alexa-skill-mcp-bridge`
- **What happened:** `npm run deploy` exited 1 with no message right after its model check, and `npm run doctor` said "ask not found" with ask-cli installed. Both spawn `npx` and `ask`, which on Windows are `.cmd` shims that `spawnSync` cannot start without a shell (`ENOENT`).
- **Impact:** A silent failure; we traced it with a one-line `spawnSync('npx')` check. Fixed in our fork by spawning through a shell on Windows.
- **Suggestion:** Run the scripts on a Windows CI runner.

## 14. Alexa transcribes "CX-5" as "CX 5"

- **Area:** Alexa speech recognition, and our own resolver
- **What happened:** "Close out the CX-5" reached our server as "the CX 5", and our resolver, which kept hyphenated words as one token, found no order.
- **Impact:** A demo phrase that passed every text test failed by voice. Fixed by splitting hyphens on both sides.
- **Suggestion:** None for Amazon; for anyone building a voice MCP server, test with what the speech recognizer actually sends.

## 15. The bridge kept a dead MCP session after our server redeployed

- **Area:** `alexa-skill-mcp-bridge` agent
- **What happened:** After we redeployed Counterpart, every tool call from the Skill failed: our new task answered 404 for the old session id, which MCP defines as "start a new session", but the agent kept the session for the life of its AgentCore microVM, which Alexa reuses per user for up to 8 hours.
- **Impact:** Every spoken request answered "Sorry, I still can't…". Fixed in our fork: one reconnect and retry on 404. Deploying the fix was not enough on its own: after the endpoint moved to the new runtime version, AgentCore kept routing brand-new sessions to warm containers of the two previous versions (started hours earlier, before the update), so the old code kept answering until those containers reached their 8-hour lifetime. Runtime versions cannot be deleted to force it.
- **Suggestion:** Handle 404 as the MCP spec says. For AgentCore, drain containers of older versions once the endpoint's live version changes, or document how to do it.

## 16. Remembered failures made the model stop calling tools

- **Area:** `alexa-skill-mcp-bridge` agent with Amazon Bedrock AgentCore Memory
- **What happened:** By default the bridge rehydrates the user's recent turns from earlier sessions and extracts long-term "preferences". After a day of failed tests, every new session started with a history full of "Sorry, I couldn't…", and Nova 2 Lite answered "Sorry, I still can't…" without calling a single tool. Counterpart's logs showed no tool calls at all.
- **Impact:** Half a day spent assuming the server or the deploy was still broken. Fixed by deleting the actor's memory events and records, and by turning off cross-session rehydration and long-term memory in our fork.
- **Suggestion:** Don't rehydrate turns from other sessions by default for tool-backed skills whose answers come from live data, or at least drop tool-error turns from what gets rehydrated.

## 17. Nova 2 Lite drafted a second date field next to the due date

- **Area:** Amazon Bedrock (Nova 2 Lite), setup assistant
- **What happened:** Asked to draft a flower shop, Nova 2 Lite returned a valid profile with `due: required` **and** a required `event_date` order field, three runs out of three, and with only 5 catalog items. Prompt changes raised the catalog to 12–25 items but the extra date stayed, and a more insistent prompt made one run fail validation.
- **Impact:** Taking an order would have asked for two dates. We now drop order fields named like a date when `due` is set, right after validation, so no repair round is needed and the draft keeps its `consumes` (about 5 s per draft in the deployed flow).
- **Suggestion:** Nothing for Bedrock; for builders: fix deterministically in code what the model keeps getting wrong, instead of fighting it in the prompt.

## 18. The bridge's agent doesn't see tools added mid-session

- **Area:** `alexa-skill-mcp-bridge` agent on Amazon Bedrock AgentCore
- **What happened:** A blank business exposes three setup tools; after activation the server swaps them for the nine business tools and sends `notifications/tools/list_changed`. The bridge builds its Strands agent (tools and system prompt) once per container and never listened for the notification. We assumed reopening the skill would start a fresh agent, but the skill uses the hashed **user** id as the AgentCore `runtimeSessionId`, so the same warm container (and the same agent, with its old tools and its conversation) answers every session of that user for up to its idle timeout. In the simulator, "take an order" after activation got "I don't have a tool for that", even after reopening, and one session's history leaked into the next.
- **Impact:** The setup assistant looked broken on its first real voice test. Fixed in our fork: the MCP client drops its cached tools on `tools/list_changed`, and before each request the agent is rebuilt when the tools changed (keeping the conversation) or when a new Alexa session starts (clean history, tools listed again). Now "yes, turn it on" and "take an order for Maria Lopez" work in the same conversation.
- **Suggestion:** Honor `tools/list_changed` in the bridge, and key conversation state by the Alexa session, not only by the container.

## 19. A one-day period drew one bar across the whole chart

- **Area:** Counterpart sales report MCP App, seen in basic-host
- **What happened:** On a Monday, "this week" is one day, and the chart drew a single bar as wide as the card.
- **Impact:** Looked broken in the demo recording, which falls on a Monday. Bars are now capped at 64 px and centered.

## 20. The agent polled a slow tool in a loop, and the turn fell apart

- **Area:** `alexa-skill-mcp-bridge` agent with Nova 2 Lite, Counterpart setup assistant
- **What happened:** The draft is generated in the background (it takes longer than one Alexa turn). Right after starting it, the agent called `review_business_setup` eleven times in one turn, each answering "still drafting", until the 6.5 s budget ran out. The bridge passes Nova the tool's `structuredContent` (JSON), not its text, so our "don't check yet" never reached the model.
- **Impact:** "Sorry, something went wrong", and a muddled history that later made "yes, turn it on" do nothing. Fixed on our side: the setup tools' JSON now carries the spoken message, and the review waits for a draft in progress (up to 20 s) so the agent checks once.
- **Suggestion:** For tools that return both, give the model the text as well as the JSON, or document that only `structuredContent` reaches it.

