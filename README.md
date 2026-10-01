# Counterpart

**One voice assistant for any small business that runs on orders.**

Counterpart is a self-hosted [MCP](https://modelcontextprotocol.io) server that lets Alexa+ run a small business's day by voice: open a job, move it along, add parts or labor, check and reorder stock, take payment, and hear how the day is going. Built for the Alexa+ track of *Build, Ship, Shape: Amazon Developer Hackathon* (2026).

**Demo video (2:55): [watch on YouTube](https://youtu.be/5FErlAKw83U).** An auto shop run by voice, the same answers as MCP Apps on a screen, a bakery in its own words, and a new flower shop set up just by describing it, all on the real system deployed on AWS.

## For judges

### Try it in two minutes (no AWS account needed)

Requirements: Node.js 24.

```bash
git clone https://github.com/Raul99Alejandro/counterpart.git && cd counterpart
npm ci
npm run dev        # MCP server on http://127.0.0.1:3000/mcp, in-memory store, three demo businesses
```

In a second terminal (bash), check it end to end (6 checks: health, auth, protocol version 2025-11-25, the nine tools, a spoken summary, session isolation between businesses):

```bash
SMOKE_TOKEN=demo-shop-token SMOKE_OTHER_TOKEN=demo-bakery-token npm run smoke -- http://127.0.0.1:3000/mcp
```

Then call the tools the way Alexa+ would, with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector): `npx @modelcontextprotocol/inspector`, transport **Streamable HTTP**, URL `http://127.0.0.1:3000/mcp`, header `Authorization: Bearer demo-shop-token`. Try:

| Tool | Arguments | What you hear |
|---|---|---|
| `get_shop_snapshot` | — | The day in one spoken sentence; the result also points to the snapshot MCP App |
| `find_work_orders` | `{"query": "the blue sedan"}` | "1 work order: work order 41, Dana Lee's 2019 blue sedan." |
| `add_parts_or_labor` | `{"order": "the blue sedan", "item": "front brake pads"}` | The line added and the new total |
| `sales_report` | `{"period": "last_week"}` | Last week against the week before; the result also points to the sales MCP App |

Use `demo-bakery-token` to see the same engine as a bakery (`take_cake_order`, `check_ingredients`…).

### Set up a new business by voice (needs AWS credentials with Amazon Bedrock access to Nova 2 Lite)

Start the server with AWS credentials in the environment and connect with `demo-florist-token`, a blank flower shop. It has only three tools:

1. `set_up_my_business` with `{"description": "I run a flower shop. We take orders for bouquets and centerpieces, then arrange them, and they're ready for pickup or delivered."}`. It answers right away; Nova 2 Lite drafts in the background.
2. A few seconds later, `review_business_setup`: the spoken summary (and the draft as an MCP App in hosts that render them).
3. `activate_business_setup` with `{"confirm": true}`. The server sends `notifications/tools/list_changed`, and the tool list becomes the flower shop's nine tools, named in its own words, in the same session.

### What's real and what's simulated

| Part | Status |
|---|---|
| MCP server (spec 2025-11-25, Streamable HTTP), nine tools per business, three MCP Apps | **Real.** Deployed on AWS (ECS Express Mode, DynamoDB, Secrets Manager) and covered by 338 automated tests |
| Voice | **Real Alexa:** speech recognition and text-to-speech in the Alexa developer console simulator, through an Alexa Skill per business |
| The agent that picks the tool | **Stand-in for Alexa+:** the Alexa+ MCP Toolkit is not public, so a Strands agent on Bedrock AgentCore (Nova 2 Lite) plays the Alexa+ orchestrator through our fork of [alexa-skill-mcp-bridge](https://github.com/Raul99Alejandro/alexa-skill-mcp-bridge/tree/counterpart) |
| Setting up a business by voice | **Real:** Nova 2 Lite on Bedrock drafts it, the server validates it, and nothing activates without the owner's yes |
| MCP Apps on screen | **Real** in the MCP Apps reference host (basic-host); not verified on an Alexa+ device, which we could not access |
| Payments | **Recorded, not charged:** closing out an order records card or cash; there is no payment processor |
| Businesses, customers and sales history | **Demo data**, seeded deterministically |
| Demo video | The product footage was recorded live and only trimmed; the B-roll scenes, the narration voices and the music are AI-generated |

Also: the [Agent Skill](skills/counterpart/SKILL.md), the [friction log](docs/friction-log.md) (24 entries), the [AWS architecture](docs/aws-builder.md), and tool choice measured against Nova 2 Lite with the golden phrases in `test/golden/` (auto shop 22/22, bakery 23/23).

## The idea

A mechanic under a car and a baker with frosting on their hands have the same problem: the system that runs their shop is on a computer across the room. Their businesses look nothing alike, but they share a shape — orders that move through stages, items that get used up, payments at the end.

Counterpart has one engine for that shape and a **business profile** for each kind of business. A profile is a YAML file with the business's vocabulary, stages, and tool names. The server generates each tool's name, description, and input schema from it, so Alexa+ reads a repair shop's `open_work_order` ("Open a new work order, also called a repair order, RO, ticket or job…") and a bakery's `take_cake_order` from the same code.

A business that isn't in the box can be **set up by voice**. A blank business starts with three setup tools. The owner describes the business ("I run a flower shop. We take orders for bouquets and centerpieces…"), and Amazon Nova 2 Lite on Bedrock drafts its order stages and catalog. Alexa reads back a summary, an MCP App shows the draft on screen, and nothing turns on until the owner says yes; the server enforces that, not the prompt. Then the server swaps in the business's nine tools and sends `notifications/tools/list_changed`, so the same conversation goes on: "Take an order for Maria Lopez, a dozen roses for Friday."

## Tools

| Intent | Auto repair | Bakery |
|---|---|---|
| Day summary (with UI) | `get_shop_snapshot` | `get_bakery_snapshot` |
| Find orders | `find_work_orders` | `find_cake_orders` |
| Open an order | `open_work_order` | `take_cake_order` |
| Change stage | `move_work_order_stage` | `move_cake_order_stage` |
| Add to an order | `add_parts_or_labor` | `add_to_cake_order` |
| Check stock | `check_parts_stock` | `check_ingredients` |
| Reorder | `reorder_parts` | `reorder_ingredients` |
| Close out and charge | `close_out_work_order` | `close_out_cake_order` |
| Sales report (with UI) | `sales_report` | `sales_report` |

Every reply is one or two plain English sentences meant to be spoken. People say "the blue sedan" or "Dana's", not "order 4821", so every tool accepts spoken references and asks "which one?" when two orders match. Voice assistants retry, so the writes that can safely repeat are idempotent: opening the same order again within two minutes returns the one already open, moving an order to the stage it is already in changes nothing, reordering skips items already on order, and closing out an order that was already closed today reports it without charging again. Adding parts or labor is deliberately not deduplicated, because adding the same item twice can be intended. The two reporting tools also return an [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) UI for screen devices.

A blank business has three setup tools instead: `set_up_my_business` (starts a draft in the background, since drafting takes longer than one Alexa turn), `review_business_setup` (speaks the draft and shows it as an MCP App) and `activate_business_setup` (turns it on or throws it away, only after the owner answers).

### Agent Skill

[`skills/counterpart/SKILL.md`](skills/counterpart/SKILL.md) is an [Agent Skill](https://agentskills.io) that teaches any agent how to use these tools by voice: pass the owner's words as they were said, never ask for an order number, ask "which one?" when the server does, close out only with the payment method the owner gave, and run the setup flow one step per turn with the owner's yes in between. A test (`test/unit/agent-skill.test.ts`) fails if the skill names a tool the server doesn't expose, and its example answers are the demo shop's real replies.

## Architecture

```
MCP client (Alexa+ or any MCP host)
        │  Streamable HTTP · MCP 2025-11-25 · Authorization: Bearer <token>
        ▼
Counterpart
  http/      /ping · /mcp · token → business · per-client sessions bound to a business · JSON logs
  tools/     nine tools generated from the business profile · MCP Apps UIs
  domain/    pure rules: orders · inventory · spoken references · reports
  store/     MemoryStore (dev) · DynamoStore (single-table DynamoDB)
```

The bearer token decides which business is calling. Each client connection gets its own MCP session, built from that business's profile and bound to the business whose token opened it. A session only accepts requests that carry a token for that same business. An unknown session id, or one that belongs to another business, gets a 404 so the client starts a new session.

## Quick start

Requirements: Node.js 24 and npm. Docker if you want DynamoDB.

```bash
npm ci
npm run dev
```

The in-memory store seeds three demo businesses at startup, with development-only tokens: the auto shop (`demo-shop-token`), the bakery (`demo-bakery-token`) and a blank flower shop to set up by voice (`demo-florist-token`). Check the server end to end:

```bash
SMOKE_TOKEN=demo-shop-token SMOKE_OTHER_TOKEN=demo-bakery-token npm run smoke -- http://127.0.0.1:3000/mcp
```

To use a graphical MCP client such as the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), point it at `http://127.0.0.1:3000/mcp` with the header `Authorization: Bearer demo-shop-token`. For hosts that cannot send headers, run locally without a token instead:

```bash
npx cross-env COUNTERPART_DEV_BUSINESS=shop HOST=127.0.0.1 npm run dev
```

That mode is refused on any address other than `127.0.0.1`.

## Run with DynamoDB Local

```bash
docker compose up -d --build
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run seed -- --reset
npm run smoke -- http://localhost:3000/mcp demo-shop-token
```

DynamoDB Local runs in memory, so reseed whenever its container restarts.

To issue a real token for a business, stored only as a SHA-256 hash:

```bash
npx cross-env COUNTERPART_STORE=dynamo DYNAMODB_ENDPOINT=http://localhost:8000 npm run token -- shop
```

## Deploy to AWS

Everything runs in `us-east-1`. You need the AWS CLI v2 with a signed-in profile, Docker, and Git Bash on Windows.

```bash
export AWS_PROFILE=<your profile> AWS_REGION=us-east-1
npm run deploy                     # ECR, DynamoDB, logs, IAM, ECS Express Mode; prints https://<host>/mcp
npx cross-env COUNTERPART_STORE=dynamo COUNTERPART_ALLOW_REMOTE_RESET=1 npm run seed -- --reset
npx cross-env COUNTERPART_STORE=dynamo npm run token -- shop --secret     # token → Secrets Manager
npx cross-env COUNTERPART_STORE=dynamo npm run token -- bakery --secret
npm run smoke -- https://<host>/mcp --secret counterpart/shop/token --other-secret counterpart/bakery/token
```

The first deploy starts the service with `/mcp` closed (`COUNTERPART_ALLOWED_HOSTS=bootstrap`), reads the public hostname Express Mode assigns, and redeploys with only that hostname allowed. `/ping` answers any Host, because the load balancer's health check calls it by the task's IP.

**Tear it down** when you are done. The load balancer bills by the hour even with no traffic:

```bash
npm run teardown -- --yes          # add --keep-data to keep the table and the tokens
```

## Connect the Alexa bridge

The Alexa+ MCP Toolkit is not public, so the voice demo uses [alexa-skill-mcp-bridge](https://github.com/KayLerch/alexa-skill-mcp-bridge): an Alexa Skill plus an agent on Amazon Bedrock AgentCore (Nova 2 Lite) that plays the Alexa+ orchestrator. We run one bridge per business, the way each business would install its own Alexa+ add-on. Our [fork](https://github.com/Raul99Alejandro/alexa-skill-mcp-bridge/tree/counterpart) adds what that needs: `BRIDGE_STACK_NAME` and `BRIDGE_INVOCATION_NAME` in `.env` (several Skills in one account), a refresh of the agent's tools on `tools/list_changed`, a clean history per Alexa session, a reconnect when the server forgets a session, `BRIDGE_TOOL_INTENTS=false` (every phrase reaches the agent whole) and `BRIDGE_KEEP_SESSION_OPEN=true` (follow-ups after a statement stay in the Skill). The tool refresh and the reconnect are proposed upstream in [KayLerch/alexa-skill-mcp-bridge#1](https://github.com/KayLerch/alexa-skill-mcp-bridge/pull/1).

`.env` for the auto shop (one clone per business):

```bash
BRIDGE_MCP_URL=https://<host>/mcp
BRIDGE_MCP_AUTH_TYPE=bearer
BRIDGE_MCP_SECRET_NAME=counterpart/shop/token
BRIDGE_INVOCATION_NAME=oak street auto
BRIDGE_STACK_NAME=CounterpartShopBridge
```

Then `npm run generate && npm run deploy && npm run skill:deploy && npm run deploy`, and open the skill's Test tab in the Alexa developer console. The bakery uses `counterpart/bakery/token`, `sweet crumb bakery` and `CounterpartBakeryBridge`.

The third bridge talks to a **blank** business created with `npm run business:new -- florist "Petal and Stem" --secret`: `counterpart/florist/token`, `petal and stem` and `CounterpartFloristBridge`. Its skill starts with the three setup tools; after you say yes to the draft, the same conversation continues with the new business's nine tools (our fork refreshes the agent on `tools/list_changed`). Its `.env` also sets `BRIDGE_TOOL_INTENTS=false`, so every phrase reaches the agent whole: the setup tools it was generated from don't exist after activation.

## See the screens in basic-host

Counterpart's three MCP Apps (today's snapshot, the sales report and the setup draft) render in any MCP Apps host. To try them locally with the reference host from [ext-apps](https://github.com/modelcontextprotocol/ext-apps):

```bash
npx tsx src/index.ts                                  # Counterpart on :3000, in-memory store, demo tokens
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host && npm install
SERVERS='["http://localhost:3000/mcp"]' npx tsx serve.ts   # open http://localhost:8080
```

basic-host sends no `Authorization` header, so either start Counterpart with `HOST=127.0.0.1 COUNTERPART_DEV_BUSINESS=shop` (local no-token mode) or put a small proxy in front that adds `Authorization: Bearer demo-shop-token`. Call `get_shop_snapshot` or `sales_report` and the screen appears next to the result; with a blank business, `review_business_setup` shows the draft.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `COUNTERPART_STORE` | `memory` | `memory` or `dynamo`. `memory` is refused when `NODE_ENV=production`, which the container image sets |
| `DYNAMODB_TABLE` | `counterpart` | Table name |
| `AWS_REGION` | `us-east-1` | AWS region |
| `DYNAMODB_ENDPOINT` | — | DynamoDB Local URL; unset for AWS |
| `COUNTERPART_DEV_BUSINESS` | — | Local no-token mode, only on `127.0.0.1` |
| `COUNTERPART_ALLOW_REMOTE_RESET` | — | `1` lets `npm run seed -- --reset` delete and reseed the demo businesses in a remote table; the table and its tokens are kept |
| `COUNTERPART_ALLOWED_HOSTS` | — | Comma-separated hostnames `/mcp` accepts. Required when `NODE_ENV=production`; `bootstrap` keeps `/mcp` closed until the hostname is known |
| `COUNTERPART_SETUP_MODEL_ID` | `us.amazon.nova-2-lite-v1:0` | Bedrock model the setup assistant uses to draft a blank business's profile and catalog |

## Tests

```bash
npm test               # unit and integration
npm run typecheck
npm run dynamo:up      # start DynamoDB Local
npm run test:dynamo    # store contract against DynamoDB Local
```

DynamoDB Local takes a few seconds to start; wait for it before running `npm run test:dynamo`.

`MemoryStore` and `DynamoStore` run the same contract suite, including atomic writes and inclusive civil-date ranges. `test/golden/` holds spoken phrases paired with the tool each should trigger, for evaluating tool selection against a real model.

## Adding a business

A new business is data, not code: a folder under `seed/businesses/` with `business.yaml`, `catalog.yaml` and an optional `demo.yaml`, checked with `npm run business:check -- <folder>` and seeded with `npm run business:add -- <folder>`. Or create an empty one with `npm run business:new -- <id> "<name>"` and configure it by voice with the setup assistant. See [docs/add-a-business.md](docs/add-a-business.md); `seed/businesses/bike-shop` was written by hand without touching code.

## Project layout

```
src/profiles/   business profiles and their validation
src/domain/     pure business rules
src/store/      store interface, in-memory and DynamoDB implementations
src/speech/     spoken English phrasing
src/tools/      the nine MCP tools and the MCP Apps resources
src/setup/      the setup assistant: three setup tools, Nova 2 Lite drafting, validation and repair
skills/         the Agent Skill: how an agent should use Counterpart's tools by voice
src/http/       Express app, auth, sessions, request context
ui/             the three MCP Apps UIs (built with Vite into single HTML files)
seed/           business packages (seed/businesses/), deterministic seeding and the business CLI
infra/          token CLI, smoke check, build helpers
test/           unit, integration, contract and golden-phrase tests
```

## Status

Done: the server, both profiles, the nine tools, the setup assistant (a new business set up by voice with Nova 2 Lite), token auth with per-business sessions, DynamoDB persistence, structured logs, the three MCP Apps UIs, the container image, and the tests.

Deployed on AWS: ECS Express Mode behind HTTPS, DynamoDB, Secrets Manager and CloudWatch Logs ([docs/aws-builder.md](docs/aws-builder.md)). The remote smoke test passes 6 of 6 checks.

Voice: one Alexa Skill per business ("open oak street auto", "open sweet crumb bakery", "open petal and stem" for the business set up by voice) through the bridge described above, tested in the Alexa developer console simulator. Every phrase of the demo script passes. The Alexa+ MCP Toolkit is not publicly available (`@alexa-ai/cli` is served from a private registry), so the bridge's agent on Bedrock AgentCore emulates the Alexa+ orchestrator. See [docs/friction-log.md](docs/friction-log.md).

Tool choice, measured with the golden phrases in `test/golden/` against Amazon Nova 2 Lite (`npm run golden -- <profile>`): auto shop 22/22, bakery 23/23.

## License

[MIT](LICENSE)
