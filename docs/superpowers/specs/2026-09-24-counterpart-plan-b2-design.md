# Counterpart — Plan B2: deployment, voice and voice-configurable businesses

- **Date:** 2026-09-24
- **Status:** draft for review
- **Base:** [`2026-09-15-counterpart-alexa-mcp-design.md`](2026-09-15-counterpart-alexa-mcp-design.md) (the "base spec"). This document **extends** it; where it contradicts the base spec, this one wins.
- **Inputs:** [`../../plan-b-carryover.md`](../../plan-b-carryover.md) (status after Plan B1) and [`../../demo-script.md`](../../demo-script.md).
- **Submission deadline:** 23 Oct 2026, 1:00 PM CST.

---

## 1. Summary

Plan B1 left Counterpart complete locally: two profiles, nine tools per profile, two MCP Apps and 195 passing tests. Plan B2 takes it to production and to the demo, in two stages:

- **Stage 1, early submission (~25–30 Sep):** Counterpart deployed on AWS with ECS Express Mode, two Alexa Skills (one per business) on `alexa-skill-mcp-bridge`, golden phrases against Nova 2 Lite, video and Devpost submission.
- **Stage 2, improvements on what was submitted (~1–8 Oct):** businesses configurable without programming, a **voice setup assistant**, the open debt from Plan B1, interoperability with `basic-host`, and an updated video and submission.

Stage 1 leaves a valid submission on its own. Stage 2 only improves it: Devpost allows editing until the deadline.

## 2. Decisions made

| Decision | Choice | Reason |
|---|---|---|
| Scope | Full: includes the open debt from Plan B1 | Code quality is judged in the public repo |
| Schedule | Submit early and keep improving | A late failure does not leave the track without a submission |
| Voice surface | Alexa console simulator | There is no Echo; the base spec already accepts it (§10.1) |
| Switching businesses in the video | One Skill per business | That is how real Alexa+ works: each business installs its add-on |
| Deployment | AWS CLI scripts (`infra/deploy.sh`, `infra/teardown.sh`) | Express Mode creates the service, load balancer and HTTPS in one command; base spec §8 already chose it |
| New businesses | Profile and catalog as data, no code | "One engine, any business" is demonstrated, not promised |
| Setup assistant | By voice, with a draft view as an MCP App | Easiest for the user; the web view is optional |
| AWS account plan | Paid plan, right before the first deployment | Bedrock AgentCore is exclusive to the paid plan, and that plan is the only one that accepts promotional credits |

## 3. Architecture

```
  Alexa console simulator (voice)
     ├─ "open oak street auto"       ─► Skill + bridge #1 ─┐
     ├─ "open sweet crumb bakery"    ─► Skill + bridge #2 ─┤  Lambda + Strands agent
     └─ "open <new business>"        ─► Skill + bridge #3 ─┘  on AgentCore (Nova 2 Lite)
                                                             │ MCP · Streamable HTTP · Bearer
                                                             ▼
        ┌──────────────── Counterpart (ECS Express Mode, 1 task) ─────────────────┐
        │ http/    /ping · /mcp · token → business · allowedHosts · session cap   │
        │ tools/   active business → its 9 tools · blank business → setup tools   │
        │ setup/   draft with Nova 2 Lite (Bedrock) · validation · activation     │
        │ ui/      snapshot · sales report · setup draft                          │
        │ store/   DynamoStore ────────────────────────────────► DynamoDB          │
        └───────────────────────────────────────┬─────────────────────────────────┘
                                                ▼
                                   CloudWatch Logs (JSON per line)

  Web view of the MCP Apps: ext-apps basic-host ──► the same /mcp
```

Fundamental changes from the base spec:

1. **A business's profile is data, not a file.** It lives in DynamoDB next to the business. The YAML files in `src/profiles/` become **templates**: businesses are seeded from them and the server no longer reads them at request time.
2. **A business has a state:** `blank` (just created, exposes only the setup tools) or `active` (exposes its nine tools).
3. **Counterpart calls Bedrock**, only from `setup/`. The rest of the server stays AI-free.

## 4. Stage 1: early submission

### 4.1 Step 0: prerequisites outside the code

- The AWS account moves to the **paid plan**. The account owner does it; no script does.
- Already verified on 2026-09-24: Nova 2 Lite responds in us-east-1 **only through an inference profile**. `amazon.nova-2-lite-v1:0` returns `ValidationException`; **`us.amazon.nova-2-lite-v1:0`** is used, which is also the bridge's default value.
- The default VPC has public subnets in 6 availability zones: it meets the Express Mode requirement (base spec §8).

### 4.2 Spikes (half a day, before building)

| # | What | Success criterion | If it fails |
|---|---|---|---|
| S1 | Real Counterpart image on ECS Express Mode | The HTTPS URL answers `/ping`; `initialize` negotiates `2025-11-25`; an SSE stream is still alive after 60 s | Review the keep-alive and idle timeout (base spec §7.10) before continuing |
| S2 | Two bridge deployments in the same account | Two independent stacks and Skills, each with its own MCP URL and secret | A single Skill; businesses are switched with a cut in the video |
| S3 | Bridge with `features.catchAll` against a server whose `tools/list` changes after the Skill is deployed | A phrase that matches no intent in the voice model reaches the agent and it calls the new tool | The new business uses `toolIntents: false`, or its Skill is regenerated and redeployed after activation |
| S4 | Latency of generating a draft with Nova 2 Lite (profile + catalog) | Measure p50 and p95 | Confirms or rules out the asynchronous design of §5.3 |

S3 and S4 feed Stage 2, but they are tested on day 1: if either changes the design, it is known before building.

### 4.3 Deployment (`infra/deploy.sh`, `infra/teardown.sh`)

Bash scripts (on Windows they run with Git Bash), with profile and region from environment variables. Idempotent: running them twice duplicates nothing.

**`deploy.sh`:**

1. Creates, if they don't exist: the `counterpart` ECR repository, the `counterpart` table (on-demand, with TTL on the `expiresAt` attribute for drafts), the log group with 14-day retention and the IAM roles.
2. **Least-privilege task role:** read and write only on the `counterpart` table, and `bedrock:InvokeModel` only on the Nova 2 Lite inference profile and its target models.
3. Builds the image, tags it with the commit and pushes it to ECR.
4. The first time, `aws ecs create-express-gateway-service` (0.25 vCPU / 0.5 GB, port 3000, health check `/ping`, minimum and maximum 1 task). After that, it updates the image.
5. Reads the hostname Express Mode assigned and passes it as `COUNTERPART_ALLOWED_HOSTS` in a second update. The hostname is only known after the service is created.
6. Runs `infra/smoke.ts` against the public URL (§4.6).

**`teardown.sh`:** deletes the Express Mode service (and the load balancer with it), the ECR repository, the secrets, the log group and the table. At the end it lists what is left, with one query per resource type, and fails if anything remains. The bridge stacks are taken down with their own `cdk destroy`, and the script reminds you of that when it finishes.

**Teardown is tested in Stage 1:** deploy, tear down, verify nothing is left and deploy again.

### 4.4 Security before exposing the service

- **`allowedHosts`** in `createMcpExpressApp`, from `COUNTERPART_ALLOWED_HOSTS`. Without the variable in production (`NODE_ENV=production`), the process **refuses to start**, just as it already does with `COUNTERPART_STORE`.
- **Real tokens:** `npm run token -- <bizId>` against the remote table stores only the hash (already exists) and now also writes the plain value to Secrets Manager, at `counterpart/<bizId>/token`, which is where the bridge reads it from. The value is not printed to the terminal. The `DEMO_TOKENS` are never installed in the remote table (already guaranteed in B1).
- **Session cap per token:** 10 open sessions per business. The 11th gets HTTP 429 and a `warn` log. Idle sessions are still closed after 30 minutes.
- **Logs to CloudWatch:** the container's stdout, which is where `log.ts` already writes. Never tokens or the full request (already guaranteed in B1).

### 4.5 Voice

- A clone of the bridge **outside the Counterpart repo**: it is third-party (Apache-2.0) and has its own deployment cycle. It is configured through `.env`, one deployment per business: `BRIDGE_MCP_URL` is the public `/mcp` URL, `mcp.auth.type` is `bearer` and `BRIDGE_MCP_SECRET_NAME` is `counterpart/<bizId>/token`.
- Invocation names: `oak street auto` and `sweet crumb bakery`.
- The exact configuration of each deployment is documented in the Counterpart README, in the "Connect the Alexa bridge" section (base spec §13).
- The seven script phrases are tested in the simulator before recording.

### 4.6 Golden phrases

- A runner (`npm run golden -- <profile>`) reads `test/golden/<profile>.yaml` and sends each phrase **in order, in a single session and with a fresh seed** to the bridge agent in local mode (Track A). It compares the chosen tool and its key arguments with what was expected and leaves a report with hits and misses.
- If Track A cannot be driven from a script, the runner calls Nova 2 Lite through the Bedrock Converse API with the same `tools/list` and the same bridge system prompt. The report says which of the two modes was used.
- **Target: 18 of 20 or more per profile.** Whatever fails is fixed in the tool descriptions and synonyms, never in the phrases.
- If Nova 2 Lite does not reach the target after two rounds of adjustments, the alternative model the bridge already documents is used (`fallbackModelId`, Claude Haiku 4.5 on Bedrock), and it is noted in the friction log.

### 4.7 Remote smoke test

`infra/smoke.ts` is extended to run against the public URL:

- `/ping` answers 200;
- no token → 401;
- with token → `initialize` negotiates `2025-11-25` and `tools/list` returns the profile's nine tools;
- a session id used with another business's token → 404;
- one read call per business responds with speakable text.

### 4.8 Video and submission (Stage 1)

- The script in [`demo-script.md`](../../demo-script.md) stays. Only step 5 changes: the diagram shows the deployed architecture from §3.
- `docs/aws-builder.md` (services, reason and diagram), `docs/friction-log.md` and `docs/product-feedback.md` are completed, plus the deployment and bridge sections in the README.
- Video ≤ 3 min on YouTube. Devpost submission: Alexa+ track, AWS Builder and Open Source mini-challenges.

## 5. Stage 2: voice-configurable businesses

### 5.1 A business without programming

**Data model (added to base spec §7.3):**

| Entity | PK | SK | Attributes |
|---|---|---|---|
| Business | `BIZ#<bizId>` | `META` | those from the base spec, plus `status` (`blank` · `active`) and **without** `profileId` |
| Profile | `BIZ#<bizId>` | `PROFILE` | `profile` (JSON validated with `parseProfile`), `source` (`template:<id>` · `assistant`), `version` |
| Draft | `BIZ#<bizId>` | `DRAFT` | `description`, `state` (`generating` · `ready` · `failed`), `profile?`, `catalog?`, `error?`, `createdAt`, `expiresAt` (24 h TTL) |

- Every existing business is migrated to `status: active`, with its profile copied from the template. Seeding does it that way from the start.
- **The server loads the profile from the store** when opening the session and caches it by `(bizId, version)`. This also closes the B1 debt of "reading and parsing the YAML on every request".

**Business package**, one folder per business in `seed/businesses/<bizId>/`:

- `business.yaml`: name, time zone, tax rate, starting order number and the profile template (or a custom profile);
- `catalog.yaml`: items (name, synonyms, kind, unit, price, taxable, stock, reorder point and quantity, supplier, `consumes`) and suppliers.

What is not configuration (customers, open orders and 30 days of payments) is still generated deterministically by the seed from the catalog. That way a new business comes with history for the charts without writing code. The script's fixed customers and assets (Dana Lee and her Civic, Nina Patel and her CX-5, etc.) move to an optional `demo.yaml` in the package.

**New commands:**

- `npm run business:check -- <folder>` validates the package with the same schemas as the server and names the exact field and how to fix it.
- `npm run business:add -- <folder>` seeds it and issues its token (§4.4).
- `npm run business:new -- <bizId> "<name>"` creates a **blank** business with its token, for the assistant (§5.2).

**Guide:** `docs/add-a-business.md`, "add your business in 15 minutes". It includes a third example package, created by hand without touching code, which serves as a test.

### 5.2 Setup assistant: flow

A `blank` business exposes **only** three tools, with the same response contract as base spec §7.7 (speakable text + `structuredContent`):

| Tool | Input | What it does |
|---|---|---|
| `set_up_my_business` | `description` (free text) | Starts generating the draft and responds immediately: *"I'm drafting your setup. Ask me what I came up with in a few seconds."* |
| `review_business_setup` | none | If the draft is ready, summarizes it in two sentences (business type, stages, number of items) and asks whether to activate it. If it is still generating, it says so. If it failed, it says what was missing and asks for more detail. Carries the `ui://counterpart/setup.html` UI |
| `activate_business_setup` | `confirm` (boolean) | With `true`, writes profile and catalog, sets `status: active` and says how to get started (*"Your flower shop is ready. Try: what orders are due today?"*). With `false`, discards the draft |

- **Security:** the setup tools only exist on `blank` businesses and only write to the token's business. There is no tool that creates businesses: the operator does that with `business:new`. On an `active` business, the setup tools do not exist.
- **Cost cap:** 5 drafts per business per hour. The sixth responds asking to wait.
- **After activation**, the server replaces the three setup tools with the profile's nine in the same session and sends `notifications/tools/list_changed`. If the bridge does not refresh its list (S3), the next session already sees them, and the activation response says so: *"Open me again to start."*

### 5.3 Setup assistant: generation and validation

- **Asynchronous by design:** the bridge gives the agent 6.5 s per turn and generating profile plus catalog can take longer. Generation runs in-process (there is a single task) and leaves the result in the `DRAFT` record. If S4 measures a p95 below 3 s, responding in the same turn is allowed, but the three-tool contract does not change.
- **Call to Nova 2 Lite** through Converse with forced *tool use*. The tool's JSON schema is derived from the profile and catalog zod schemas (`z.toJSONSchema`), so there is **a single source of truth**.
- **Layered validation:**
  1. the zod schema;
  2. `parseProfile` (stages, `closeFrom`, reserved ids, unique tool names);
  3. the assistant's own rules: tool names that don't collide with the setup ones, at most 8 stages, between 5 and 60 items, prices greater than 0, `consumes` only toward existing items and with no cycles.
- **One repair:** if validation fails, the exact list of errors is sent back to Nova for a second attempt. If that also fails, the draft is left `failed` with a speakable message about what was missing (*"I couldn't tell how an order moves from start to finish. What steps does an order go through?"*).
- **Nothing is ever activated without `confirm: true`.** An unconfirmed draft expires after 24 h (TTL).

### 5.4 Draft UI (`ui://counterpart/setup.html`)

Same technique as the two existing MCP Apps (Vite, a single HTML, data through `structuredContent`). It shows:

- the business name and the nouns (*order*, *item*…);
- the stages as a line of steps, marking the closing one;
- the fields an order asks for;
- the catalog in a table (name, kind, price and stock).

The tool text is enough on its own, as base spec §7.9 requires.

### 5.5 Plan B1 debt (from `plan-b-carryover.md`)

**In scope, in this order:**

1. `putPurchaseOrders` in a single transaction.
2. `createdAt` in token rows.
3. Same behavior from both stores for a nonexistent business.
4. `ui/*/main.ts` and `ui/vite.config.ts` inside the type check.
5. Sales chart with date labels and the previous-period series.
6. **`this_week` versus `last_week` compares equivalent days:** the current week up to today against the same days of the previous week. **This changes base spec §7.4**, which compared against the full week. `this_month` versus `last_month` follows the same rule.
7. All of carryover §5: `was/were` agreement, singular `notFound`, a single `pickBest` for `findItem` and `resolveOrder`, quantity guards, "closest matches" without score 0, `package.json` cleanup, and the "details with limited consequences" (recorded payment method in `alreadyClosed`, burned order number, orphaned server and transport without `initialize`, dead `moveStage` branch, edge of the dedup window).
8. `basic-host` instructions in the README.

### 5.6 Interoperability

The ext-apps `examples/basic-host` is cloned and the three UIs (snapshot, sales report and draft) are opened against the local server and against the deployed one. Any conformance findings go to the friction log. The video's screen shots come from here.

### 5.7 Updated video and submission

The video is redone with a new scene in place of step 4 of the current script: a blank business is set up by talking, and operated with two phrases. The bakery is still mentioned as a second profile in the diagram and in the text. The length stays at ≤ 3 min. The Devpost description is updated.

### 5.8 Cut-off rule

- **If the assistant (§5.2–5.4) is not solid by 6 Oct**, it is left out without touching anything else: its tools only exist on `blank` businesses, and none of the demo businesses is one. §5.1 stays anyway, and the Stage 1 video remains the submission.
- If time runs short in general, cut in this order: (1) the minor debt in item 7 of §5.5; (2) the draft UI, which stays as text; (3) interoperability, which stays as a direct-HTTP check.

## 6. Tests

- **Everything test-first**, as in A and B1. The whole suite (195 today) passes on every task.
- **Profiles as data:**
  - store contract for `PROFILE` and `DRAFT` in `MemoryStore` and `DynamoStore`;
  - migration of a business from a template to a stored profile;
  - cache invalidated by version.
- **Business packages:** `business:check` with valid and invalid packages (each rule with its case) and a deterministic seed from a folder.
- **Assistant:**
  - the generator is injected as a dependency, so tests use recorded responses (valid, invalid-but-repairable and unrepairable) and never call Bedrock;
  - a single manual test against Nova, flagged and outside `npm test`;
  - full flow: `blank` → draft → review → activation → `tools/list` with the nine tools;
  - isolation: one business's token neither sees nor touches another's draft;
  - the setup tools do not exist on an `active` business;
  - the drafts-per-hour cap.
- **HTTP:** `allowedHosts` rejects another Host, startup fails without the variable in production, and the 11th session gets 429.
- **Remote:** the §4.7 smoke test after every deployment.
- **Voice:** golden phrases (§4.6) and the script in the simulator before every recording.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The bridge does not support two deployments in one account (S2) | One Skill; business switch with a cut in the video |
| Nova 2 Lite picks the wrong tools | Descriptions and synonyms; then `fallbackModelId` (§4.6) |
| The new business's Skill does not see the activated tools (S3) | `toolIntents: false` or redeploy its Skill after activation |
| Generating the draft exceeds the 6.5 s turn | Asynchronous design of §5.3 |
| Nova generates invalid or absurd configurations | Layered validation, one repair, mandatory confirmation, item and stage caps |
| Assistant cost from abuse | Only on `blank` businesses, which the operator creates; 5 drafts per hour |
| The service stays on after the hackathon | `teardown.sh` tested in Stage 1; shut down on 23 Oct |
| Express Mode breaks in-memory sessions when scaling | Minimum and maximum of 1 task (base spec §8) |

## 8. Costs

Approximate, us-east-1 list prices, with the service on 24 h:

| Resource | Per month |
|---|---|
| Express Mode load balancer | $17–19 |
| Public IPv4 (load balancer and task) | $7–11 |
| Fargate 0.25 vCPU / 0.5 GB | ~$9 |
| Secrets Manager (3 secrets) | ~$1.20 |
| DynamoDB, ECR, CloudWatch Logs | < $1 |
| AgentCore (3 bridges, only while processing) | $0–3 |
| Bedrock: Nova 2 Lite (agent, golden phrases and assistant) | < $2 |
| Skills' Lambda | $0 (free tier) |
| **Total** | **~$35–45** |

Deployed from ~26 Sep to 23 Oct: **~$30–40**, within the account's $100 welcome credit, not counting the hackathon's $150.

## 9. Dates

| Dates | What |
|---|---|
| 25 Sep | Step 0 and spikes S1–S4 |
| 25–28 Sep | Deployment, security, bridges, golden phrases |
| 29–30 Sep | Video and **Stage 1 submission** |
| 1–2 Oct | Business without programming (§5.1) |
| 3–6 Oct | Assistant (§5.2–5.4); **cut-off on 6 Oct** |
| 6–7 Oct | B1 debt and interoperability |
| 8 Oct | Updated video and submission |
| 23 Oct | Submission deadline and `teardown.sh` |

## 10. Out of scope

- Appointment or reservation businesses: a different engine, not a different profile.
- Creating businesses by voice: the operator does it with `business:new`. The assistant only configures a blank business.
- Editing an already active business by voice (changing stages or prices).
- Account linking and OAuth: still documented in base spec §14, not built.
- More than one ECS task or shared sessions.
