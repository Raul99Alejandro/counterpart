# Product feedback

## Alexa+ MCP Toolkit

**What worked:** The design around a standard MCP server is the right call. We could build and test everything with ordinary MCP tooling, and the functional requirements are concrete and useful: every listed tool must work, descriptions should carry synonyms, results should return stable identifiers, and errors go through `isError`. Support for MCP Apps and for account linking with any OAuth 2.1 provider covers what a real business add-on needs.

**What needs improvement:** Access. The CLI lives in a private registry, the Toolkit is US-only, and the setup guide doesn't support Windows. For a hackathon, that meant the one part of the track we could not touch was Alexa+ itself. A public sandbox or a hosted simulator would change that.

**Onboarding:** The quickstart reads well, but the first command fails for anyone outside the allowlist, with nothing explaining why.

## MCP TypeScript SDK v2

**What worked:** Standard Schema support (zod v4 objects), output schemas that skip validation on `isError`, tool annotations, and an in-memory transport that makes integration tests fast. Stateful Streamable HTTP with per-session servers fit a multi-tenant design with no workarounds.

**What needs improvement:** More discoverable examples for custom request headers on the client and for `allowedHosts` on the server — both exist only in the type declarations' JSDoc today, not the READMEs (see the friction log).

## MCP Apps (ext-apps 2.0)

**What worked:** Linking a tool to its UI with `_meta.ui.resourceUri` keeps the text reply and the visual reply in one tool, which is exactly right for voice-first devices that sometimes have a screen. Single-file HTML bundles with Vite work well.

## DynamoDB Local

**What worked:** Running the same contract suite against DynamoDB Local and the in-memory store gave us confidence that transactional writes and key ranges behave identically before touching AWS.

## Amazon ECS Express Mode

**What worked:** One `create-express-gateway-service` call gave us a service, a load balancer, a TLS certificate and a public hostname, which is the right amount of infrastructure for a single container. The managed infrastructure role policy and the `/ping` default health check meant our container needed no changes.

**What needs improvement:** Updates made right after creation. Our first update was rolled back with "productionListenerRule should have exactly one target group serving traffic but found 2", and the rollback left the listener rule weighted 950/50 toward a target group with no tasks: the endpoint answered 503 most of the time and every later update failed the same way, until we set the weights back by hand. A redeploy from scratch did not hit it again. We'd like the rollback to restore the weights, and the error to name the stuck rule. Rollouts also outlast the CLI's 10-minute `services-stable` waiter, so scripts need their own wait.

**Onboarding:** The CLI reference is complete, but we found the public endpoint only under `activeConfigurations[].ingressPaths[]` in the output shape, not in a guide.

## Amazon Bedrock (Nova 2 Lite)

**What worked:** Tool choice was good once our tool descriptions were: 22/22 for the auto shop and 21/23 for the bakery on our golden phrases, with p50 latency around 1.4 s for a forced tool call. Converse with `toolChoice` made the golden-phrase runner short.

**What needs improvement:** The model ID in the catalog doesn't work on its own; only the `us.` or `global.` inference profile does, and the error names the fix only indirectly.

## Alexa Skill MCP Bridge (community project)

**What worked:** It turned "the Alexa+ Toolkit is not public" into a working voice demo in an afternoon: generated interaction model, AgentCore agent, Secrets Manager for our token, and `doctor` checks that name the exact fix.

**What needs improvement:** On Windows its scripts could not start `npx` or `ask` (both `.cmd` shims), the stack name was fixed so a second Skill in the same account replaced the first, and the agent kept a dead MCP session after our server redeployed instead of starting a new one on HTTP 404. Our fork fixes all three: https://github.com/Raul99Alejandro/alexa-skill-mcp-bridge/tree/counterpart

**Also for Alexa+:** add-ons can change shape at runtime. Counterpart's setup assistant starts with three setup tools and, once the owner says yes, swaps them for the nine tools of the new business and sends `notifications/tools/list_changed`. An orchestrator that builds its tool list once (as the bridge did) keeps offering the old tools; our fork refreshes on the notification, which makes "set up my business, then use it" one conversation. We'd like Alexa+ to do the same.

