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
