# Friction log

Problems we hit while building Counterpart, in the order we hit them. Each entry gives the task we attempted, the steps we took, what we expected and what actually happened, a severity rating, the workaround we used, and an actionable suggestion.

Severity: **Critical** blocked the track's required technology; **High** broke the product or the demo, or cost hours; **Medium** cost real time or needed a code change; **Low** was a small detour.

| # | Area | Severity |
|---|---|---|
| 1 | Alexa+ MCP Toolkit CLI not installable | Critical |
| 2 | Alexa AI CLI: no Windows support, Node 24 | Medium |
| 3 | Alexa+ MCP Toolkit is US-only | Medium |
| 4 | Account linking with Amazon Cognito (PKCE metadata) | Medium |
| 5 | AWS App Runner closed to new customers | Low |
| 6 | MCP TypeScript SDK client: custom headers | Medium |
| 7 | MCP TypeScript SDK server: `allowedHosts` undocumented | Low |
| 8 | AWS Free plan excludes AgentCore and promotional credits | High |
| 9 | Amazon Bedrock: Nova 2 Lite needs an inference profile | Low |
| 10 | MCP TypeScript SDK server: `allowedHosts` blocks health checks | High |
| 11 | alexa-skill-mcp-bridge: one Skill per account | Medium |
| 12 | Amazon ECS Express Mode: rollback left traffic on an empty target group | High |
| 13 | alexa-skill-mcp-bridge: scripts fail on Windows | Medium |
| 14 | Alexa speech recognition: hyphenated model names | Medium |
| 15 | alexa-skill-mcp-bridge / AgentCore: dead MCP session after a redeploy | High |
| 16 | alexa-skill-mcp-bridge / AgentCore Memory: remembered failures | High |
| 17 | Amazon Bedrock (Nova 2 Lite): extra date field in drafts | Medium |
| 18 | alexa-skill-mcp-bridge / AgentCore: tools added mid-session not seen | High |
| 19 | Counterpart sales report MCP App: one-day chart | Low |
| 20 | alexa-skill-mcp-bridge: only `structuredContent` reaches the model | High |
| 21 | alexa-skill-mcp-bridge / AgentCore: per-tool intents and warm old containers | High |
| 22 | Alexa developer console simulator: microphone records silence | High |
| 23 | alexa-skill-mcp-bridge: session ends after statements | Medium |
| 24 | MCP Apps basic-host: sessions never closed | Medium |

## 1. The Alexa+ MCP Toolkit CLI is not installable

- **Area:** Alexa+ MCP Toolkit, `@alexa-ai/cli`
- **Task:** Onboard our MCP server to Alexa+ and test it in the Alexa+ web simulator.
- **Steps:** Followed the Toolkit quickstart: `npm install -g @alexa-ai/cli`.
- **Expected:** The CLI installs from npm, as the quickstart shows.
- **Actual:** The package returns 404 on the public npm registry. The setup guide mentions an AWS CodeArtifact registry in `us-west-2` that only allowlisted accounts can read, and there is no self-serve way to request access.
- **Severity:** Critical. The track's core technology was the one part we could not touch.
- **Workaround:** Built the server to the Alexa+ requirements anyway (MCP 2025-11-25, Streamable HTTP, MCP Apps) and ran the voice demo through an Alexa Skill bridge whose agent emulates the Alexa+ orchestrator.
- **Suggestion:** For a global hackathon with an Alexa+ track, publish the CLI (or a sandbox) to participants, or state the access requirement on the track page before people start building.

## 2. The Alexa AI CLI does not support Windows and needs Node 24

- **Area:** Alexa AI CLI setup guide
- **Task:** Prepare a Windows development machine for the Alexa+ Toolkit.
- **Steps:** Read the CLI's supported systems and requirements.
- **Expected:** Windows, macOS and Linux support, like the ASK CLI.
- **Actual:** Only macOS and Ubuntu are supported, and Node.js 24 or later is required.
- **Severity:** Medium.
- **Workaround:** None needed in the end (see entry 1); the plan was WSL.
- **Suggestion:** Support Windows, or document a ready-made container image for the CLI.

## 3. The Alexa+ MCP Toolkit is US-only

- **Area:** Alexa+ MCP Toolkit
- **Task:** Find out whether a participant in Mexico can test an Alexa+ add-on.
- **Steps:** Read the Toolkit overview and the hackathon rules.
- **Expected:** A global hackathon's required tools available to all eligible participants, or a clear note.
- **Actual:** The Toolkit overview says it is available in the United States; the hackathon is open to most countries, and the track page does not mention it.
- **Severity:** Medium.
- **Workaround:** The bridge path from entry 1.
- **Suggestion:** Say on the track page what non-US participants can and cannot test.

## 4. Amazon Cognito omits `code_challenge_methods_supported`

- **Area:** Alexa+ account linking with Amazon Cognito
- **Task:** Plan account linking for the add-on with Cognito as the authorization server.
- **Steps:** Compared the Alexa+ account linking requirements with Cognito's OpenID discovery document.
- **Expected:** Cognito, which supports PKCE, passes the deploy-time PKCE check.
- **Actual:** Alexa+ blocks deployment unless the authorization server advertises PKCE `S256`, and Cognito no longer lists `code_challenge_methods_supported` in its discovery document.
- **Severity:** Medium.
- **Workaround:** Serve our own authorization-server metadata that adds the field and points at Cognito's endpoints.
- **Suggestion:** Document this workaround in the account linking guide, or have the check accept Cognito.

## 5. AWS App Runner is closed to new customers

- **Area:** Hosting on AWS
- **Task:** Run the MCP server container behind HTTPS with the least setup.
- **Steps:** Followed guides and community examples that use App Runner.
- **Expected:** Create an App Runner service.
- **Actual:** App Runner stopped accepting new customers on April 30, 2026; the replacement is ECS Express Mode.
- **Severity:** Low.
- **Workaround:** ECS Express Mode.
- **Suggestion:** Point hackathon resources at ECS Express Mode.

## 6. Spreading a `Headers` object silently drops headers

- **Area:** MCP TypeScript SDK v2 client, custom `fetch`
- **Task:** Send an `Authorization` header from our smoke-test client.
- **Steps:** Wrapped `fetch` and spread `init.headers` into a new object with the token.
- **Expected:** The SDK's headers plus ours.
- **Actual:** The SDK passes a `Headers` instance; spreading it yields `{}`, which dropped the SDK's own `Accept` header, and the server answered 406.
- **Severity:** Medium. An hour on a misleading status code.
- **Workaround:** `new Headers(init?.headers)` and `set('Authorization', …)`.
- **Suggestion:** Surface `StreamableHTTPClientTransportOptions.requestInit` (a first-class way to add headers without wrapping `fetch`) and the `new Headers(init?.headers)` pattern in the client README. Today both live only in the type declarations' JSDoc (`@modelcontextprotocol/client/dist/index.d.mts`).

## 7. `allowedHosts` is undocumented outside the type declarations

- **Area:** MCP TypeScript SDK v2 server, `createMcpExpressApp`
- **Task:** Protect the server against DNS rebinding when it binds to `0.0.0.0` in a container.
- **Steps:** Followed the startup warning: "Consider using the allowedHosts option to restrict allowed hosts".
- **Expected:** README documentation of the option, including a deployed hostname.
- **Actual:** The only example is a JSDoc `@example` in `@modelcontextprotocol/express/dist/index.d.mts`, with fixed local hostnames, not a hostname a load balancer assigns at deploy time.
- **Severity:** Low.
- **Workaround:** Read the type declarations and worked out the deployed case ourselves (see entry 10).
- **Suggestion:** Document `allowedHosts` in the README, including the load-balancer case.

## 8. The AWS Free plan excludes AgentCore and hackathon credits

- **Area:** AWS account plans
- **Task:** Run the Alexa bridge's agent on Bedrock AgentCore and redeem the hackathon's $150 in credits.
- **Steps:** Started from a new account, which is on the Free plan; read the Free Tier page and the plan documentation.
- **Expected:** Hackathon credits and the hackathon's featured services usable from a new account.
- **Actual:** AgentCore is marked "Paid plan exclusive", and Free plan accounts "are not eligible for other promotional credits".
- **Severity:** High. Both the voice demo and the credits depended on it.
- **Workaround:** Upgraded the account to the Paid plan.
- **Suggestion:** Say on the hackathon resources page that participants need the Paid plan to redeem the credits and to use AgentCore.

## 9. Nova 2 Lite only answers through an inference profile

- **Area:** Amazon Bedrock, Converse API
- **Task:** Call Nova 2 Lite from the server's setup assistant.
- **Steps:** `aws bedrock-runtime converse --model-id amazon.nova-2-lite-v1:0`, the ID listed in the us-east-1 model catalog.
- **Expected:** A response.
- **Actual:** `ValidationException: Invocation of model ID amazon.nova-2-lite-v1:0 with on-demand throughput isn't supported`. Only `us.amazon.nova-2-lite-v1:0` and `global.amazon.nova-2-lite-v1:0` work.
- **Severity:** Low.
- **Workaround:** Use the `us.` inference profile.
- **Suggestion:** Show the inference profile ID next to the model ID in the catalog, and name the profile in the error message.

## 10. `allowedHosts` also guards the health check

- **Area:** MCP TypeScript SDK v2 server, `createMcpExpressApp`
- **Task:** Deploy with Host validation on, behind the ECS Express Mode load balancer.
- **Steps:** `createMcpExpressApp({ allowedHosts: [<public hostname>] })`, the way entry 7 suggests.
- **Expected:** `/mcp` protected; `/ping` reachable by the health check.
- **Actual:** Host validation covers the whole Express app. The health check calls `/ping` with the task's private IP as `Host`, gets 403, and the task never turns healthy.
- **Severity:** High. It would have taken the service down on its first deploy.
- **Workaround:** Mount `hostHeaderValidation` on `/mcp` only.
- **Suggestion:** Scope the validation to the MCP route, or document that non-MCP routes behind a load balancer need to be excluded.

## 11. The Alexa bridge deploys one Skill per account

- **Area:** `alexa-skill-mcp-bridge`
- **Task:** Deploy a second bridge for our second business (one Skill per business, the way each business would install its own add-on).
- **Steps:** Cloned the bridge again with a new `.env` and ran `npm run deploy`.
- **Expected:** A second stack and Skill.
- **Actual:** The CDK stack name `AlexaMcpBridgeStack` is fixed in `infra/bin/app.ts`, `scripts/lib.ts` and `packages/cli/src/remote.ts`, and the invocation name lives in the tracked `bridge.config.ts`, so the deploy would update the first one.
- **Severity:** Medium.
- **Workaround:** Our fork reads `BRIDGE_STACK_NAME` and `BRIDGE_INVOCATION_NAME` from `.env`.
- **Suggestion:** Read the stack name and the invocation name from `.env`, like the MCP URL.

## 12. An Express Mode rollback left traffic on an empty target group

- **Area:** Amazon ECS Express Mode
- **Task:** Update the service right after creating it.
- **Steps:** `aws ecs update-express-gateway-service` with a new image.
- **Expected:** A rolling update, or a clean rollback.
- **Actual:** "productionListenerRule … should have exactly one target group serving traffic but found 2", then a rollback that left the listener rule weighted 950/50, with 95% of traffic on a target group with no tasks. The public URL answered 503 most of the time, and every later update failed with the same error.
- **Severity:** High. About an hour, found only by reading the listener rule's weights.
- **Workaround:** `aws elbv2 modify-rule` to 999/0 toward the healthy target group. A redeploy from scratch later did not reproduce it.
- **Suggestion:** Restore the weights on rollback, and name the listener rule and its weights in the service event.

## 13. The bridge's scripts could not start `npx` or `ask` on Windows

- **Area:** `alexa-skill-mcp-bridge`
- **Task:** Deploy the bridge from Windows.
- **Steps:** `npm run deploy`, then `npm run doctor`.
- **Expected:** A deploy, or a clear error.
- **Actual:** `deploy` exited 1 with no message right after its model check; `doctor` said "ask not found" with ask-cli installed. Both spawn `npx` and `ask`, which on Windows are `.cmd` shims that `spawnSync` cannot start without a shell (`ENOENT`).
- **Severity:** Medium. A silent failure, traced with a one-line `spawnSync('npx')` check.
- **Workaround:** Our fork spawns through a shell on Windows.
- **Suggestion:** Run the scripts on a Windows CI runner.

## 14. Alexa transcribes "CX-5" as "CX 5"

- **Area:** Alexa speech recognition, and our own resolver
- **Task:** Close out an order by saying the car's model name.
- **Steps:** Said "Close out the CX-5" in the simulator.
- **Expected:** The order for that car.
- **Actual:** The phrase reached our server as "the CX 5"; our resolver kept hyphenated words as one token and found no order.
- **Severity:** Medium. A demo phrase that passed every text test failed by voice.
- **Workaround:** The resolver now splits hyphens and letter-digit boundaries on both sides.
- **Suggestion:** Nothing for Amazon. For anyone building a voice MCP server: test with what the speech recognizer actually sends.

## 15. The bridge kept a dead MCP session after our server redeployed

- **Area:** `alexa-skill-mcp-bridge` agent on Amazon Bedrock AgentCore
- **Task:** Keep using the Skill after redeploying Counterpart.
- **Steps:** Redeployed the server, then spoke to the Skill.
- **Expected:** The agent opens a new MCP session when the old one is gone (HTTP 404, as the MCP spec says).
- **Actual:** Every tool call failed: the agent kept the session for the life of its AgentCore microVM, which Alexa reuses per user for up to 8 hours. Deploying the fix was not enough: AgentCore kept routing new sessions to warm containers of the two previous runtime versions until they reached their 8-hour lifetime, and runtime versions cannot be deleted to force it.
- **Severity:** High. Every spoken request answered "Sorry, I still can't…".
- **Workaround:** Our fork reconnects and retries once on 404; we stop stale runtime sessions after each deploy.
- **Suggestion:** Handle 404 as the MCP spec says. For AgentCore, drain containers of older versions once the endpoint's live version changes, or document how to do it.

## 16. Remembered failures made the model stop calling tools

- **Area:** `alexa-skill-mcp-bridge` agent with Amazon Bedrock AgentCore Memory
- **Task:** Test the Skill the day after a run of failed tests.
- **Steps:** Opened the Skill and asked for the day's summary.
- **Expected:** A tool call and an answer.
- **Actual:** The bridge rehydrates the user's recent turns from earlier sessions and extracts long-term "preferences". Every new session started with a history full of "Sorry, I couldn't…", and Nova 2 Lite answered "Sorry, I still can't…" without calling a tool. Counterpart's logs showed no tool calls at all.
- **Severity:** High. Half a day spent assuming the server or the deploy was still broken.
- **Workaround:** Deleted the actor's memory events and records; our fork turns off cross-session rehydration and long-term memory.
- **Suggestion:** Don't rehydrate turns from other sessions by default for skills whose answers come from live data, or at least drop tool-error turns from what gets rehydrated.

## 17. Nova 2 Lite drafted a second date field next to the due date

- **Area:** Amazon Bedrock (Nova 2 Lite), Counterpart setup assistant
- **Task:** Draft a flower shop's profile and catalog from a spoken description.
- **Steps:** Forced tool use with the profile's JSON schema, three runs.
- **Expected:** A profile with one due date per order.
- **Actual:** `due: required` **and** a required `event_date` order field, three runs out of three. Prompt changes did not remove it, and a more insistent prompt made one run fail validation.
- **Severity:** Medium. Taking an order would have asked for two dates.
- **Workaround:** Drop order fields named like a date when `due` is set, right after validation, with no extra model round (about 5 s per draft in the deployed flow).
- **Suggestion:** Nothing for Bedrock. For builders: fix deterministically in code what the model keeps getting wrong, instead of fighting it in the prompt.

## 18. The bridge's agent doesn't see tools added mid-session

- **Area:** `alexa-skill-mcp-bridge` agent on Amazon Bedrock AgentCore
- **Task:** Set up a blank business by voice and use it in the same conversation.
- **Steps:** Said yes to the draft; the server swapped the three setup tools for the nine business tools and sent `notifications/tools/list_changed`. Then said "take an order", also after reopening the Skill.
- **Expected:** The agent lists tools again and uses the new ones.
- **Actual:** "I don't have a tool for that". The bridge builds its agent once per container and ignores the notification, and the Skill uses the hashed user id as the AgentCore `runtimeSessionId`, so the same warm container (same agent, old tools, old conversation) answers every session of that user; one session's history leaked into the next.
- **Severity:** High. The setup assistant looked broken on its first voice test.
- **Workaround:** Our fork drops cached tools on `tools/list_changed` and rebuilds the agent when the tools change (keeping the conversation) or a new Alexa session starts (clean history).
- **Suggestion:** Honor `tools/list_changed` in the bridge, and key conversation state by the Alexa session, not only by the container.

## 19. A one-day period drew one bar across the whole chart

- **Area:** Counterpart sales report MCP App (our code), seen in basic-host
- **Task:** Show "this week's" sales on a Monday.
- **Steps:** Called `sales_report` for this week.
- **Expected:** A normal-width bar for Monday.
- **Actual:** One bar as wide as the card.
- **Severity:** Low. It looked broken in a recording check.
- **Workaround:** Bars are capped at 64 px and centered.
- **Suggestion:** None for Amazon; for MCP App authors, test charts with one data point.

## 20. The agent polled a slow tool in a loop, and the turn fell apart

- **Area:** `alexa-skill-mcp-bridge` agent with Nova 2 Lite, Counterpart setup assistant
- **Task:** Start a draft (generated in the background, since it takes longer than one Alexa turn) and tell the owner to ask later.
- **Steps:** The start tool's text said "don't check yet"; the agent called `review_business_setup` anyway.
- **Expected:** One spoken "I've started drafting" reply.
- **Actual:** Eleven review calls in one turn, each "still drafting", until the 6.5 s budget ran out: "Sorry, something went wrong", and a muddled history that later made "yes, turn it on" do nothing. The bridge passes Nova the tool's `structuredContent` (JSON), not its text, so our instruction never reached the model.
- **Severity:** High.
- **Workaround:** The setup tools' JSON now carries the spoken message, and the review waits for a draft in progress (up to 20 s) so the agent checks once.
- **Suggestion:** For tools that return both, give the model the text as well as the JSON, or document that only `structuredContent` reaches it.

## 21. Per-tool intents and a warm old container hid the setup flow

- **Area:** `alexa-skill-mcp-bridge` Skill and Amazon Bedrock AgentCore
- **Task:** Activate the drafted business with "yes, turn it on".
- **Steps:** Deployed fixes, reopened the Skill in the simulator and said the phrase.
- **Expected:** Activation, then the new tools.
- **Actual:** Nothing changed. The Skill had one intent per setup tool, generated from their schemas, so "what did you come up with" and "yes, turn it on" reached the agent as half-filled tool hints instead of the user's words; and the user's sessions kept landing on a warm container of the previous runtime version.
- **Severity:** High. Three rounds of testing to find both causes.
- **Workaround:** `BRIDGE_TOOL_INTENTS=false`, a new setting in our fork (every phrase goes to the agent whole), and `aws bedrock-agentcore stop-runtime-session` after each agent deploy.
- **Suggestion:** For AgentCore, drain or stop sessions on older versions when the endpoint moves to a new one. For the bridge, default per-tool intents off when the server's tools can change.

## 22. The developer console simulator recorded silence from any microphone

- **Area:** Alexa developer console, Test tab (Alexa Simulator), current Chrome
- **Task:** Record the demo by voice in the simulator.
- **Steps:** Held the mic button and spoke, with a real microphone and with a virtual audio cable.
- **Expected:** A transcription and the Skill's response.
- **Actual:** "No Content" every time. The request to `avs-alexa-na.amazon.com` carried 3 s of flat noise or zeros. The recorder keeps a reference to each `ScriptProcessorNode` input buffer (`inputBuffer.getChannelData(0)`) instead of copying it, and Chrome reuses that buffer on every callback, so the recording is the last chunk repeated. It also binds the microphone once, at page load.
- **Severity:** High. Hours to find, since typed input works and one early voice test happened to pass.
- **Workaround:** A small page script hands the recorder copies and makes it reinitialize (`video/sim-mic-fix.js` in our hackathon repo).
- **Suggestion:** Copy the buffer in the recorder (`getChannelData(0).slice()`), or move it to an AudioWorklet.

## 23. The bridge ends the session after any reply that isn't a question

- **Area:** `alexa-skill-mcp-bridge` Skill
- **Task:** A natural follow-up after a statement ("I've started drafting your setup. Ask me what I came up with when you're ready.").
- **Steps:** Waited, then said "what did you come up with?".
- **Expected:** The Skill answers.
- **Actual:** The bridge sets `shouldEndSession` when the reply doesn't end in "?", so the session had closed and plain Alexa answered with shopping results.
- **Severity:** Medium.
- **Workaround:** The demo names the Skill in follow-ups ("Ask Petal and Stem what it came up with"), and our fork adds `BRIDGE_KEEP_SESSION_OPEN=true`.
- **Suggestion:** Let the agent say whether it expects a reply, instead of guessing from punctuation.

## 24. basic-host opens an MCP session per page load and never closes it

- **Area:** MCP Apps `basic-host` example, Counterpart session cap
- **Task:** Show the MCP App screens in OBS scenes for the recording.
- **Steps:** Switched scenes a few times (each switch reloads the page).
- **Expected:** The screens render every time.
- **Actual:** Each load opened an MCP session and left it open. Counterpart allows 10 open sessions per business, so after a few rounds it answered 429 and the screens stayed blank.
- **Severity:** Medium.
- **Workaround:** A local basic-host patch sends `DELETE` with the session id on `pagehide`.
- **Suggestion:** Terminate the Streamable HTTP session when the host page unloads.
