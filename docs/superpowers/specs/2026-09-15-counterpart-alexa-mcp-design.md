# Counterpart — Technical design (Alexa+ track)

- **Date:** 2026-09-15
- **Status:** draft for review
- **Hackathon:** Build, Ship, Shape: Amazon Developer Hackathon — **Alexa+** track, **AWS Builder** and **Open Source** mini-challenges
- **Submission deadline:** 23 Oct 2026, 12:00 PM PT · **Target delivery for this project:** 26 Sep 2026

---

## 1. Summary

Counterpart is a self-hosted MCP server that lets Alexa+ run the day-to-day of a small business that works with orders: open and advance orders, add line items, check and reorder inventory, take payment and see how the day is going.

A **generic core** is configured with **business profiles**. Each profile generates tools with that business's vocabulary, so the model picks the right tool. It ships with two profiles on the same engine: **auto repair shop** and **custom-order bakery**.

---

## 2. Context and constraints

### 2.1 What the track requires

- Rule: *"Build a working Agent Skill or a self-hosted MCP server, implementing MCP spec version (minimum acceptable version is 2025-11-25)."*
- The video must show the project working. *"Judges are not required to test the Project"*: they may judge only from the description, the images and the video.
- Four equally weighted criteria: Tech Implementation, Design, Potential Impact, Quality of Idea. The rubric distinguishes obvious implementations from innovative ones.

### 2.2 The Alexa+ MCP Toolkit is not available

- `npm view @alexa-ai/cli` → **404 on public npm** (verified 2026-09-15). The official install guide serves it from CodeArtifact (us-west-2), a private registry.
- Another hackathon participant documents in their repo that the Toolkit and the CLI are *"limited to select partners"*.
- Even with access: US only, no Windows support, and Node 24+ required.

**Design consequence:** the server meets the Alexa+ requirements (spec 2025-11-25, Streamable HTTP, add-on functional requirements, MCP Apps), but the demo uses a surface that does not depend on the Toolkit (§10).

### 2.3 Alexa+ add-on functional requirements adopted

- Every tool in `tools/list` works when invoked (requirement 13). Nothing half-built is published.
- Valid `inputSchema` with all required parameters declared.
- Clear descriptions, **one distinct intent per tool**, with synonyms, abbreviations and variants; no technical jargon or internal names.
- Stable identifiers in responses to chain steps.
- Errors through the MCP contract (`isError: true`); never malformed payloads or process crashes.

### 2.4 Our own constraints

- **100% new, original code, schema and data.** Nothing is reused from client projects. Public repo under the MIT license.
- Demo in English (en-US) with fictional US businesses.
- AWS budget: the hackathon's $150 in credits.

---

## 3. Goals and non-goals

**Goals**

1. Nine working tools per profile, with two profiles on the same core.
2. Voice demo on a real Alexa surface (Echo or the console simulator) and visuals with MCP Apps.
3. Documented AWS deployment to qualify for the AWS Builder mini-challenge.
4. Live robustness: spoken references, errors that can be said out loud, idempotent writes.

**MVP non-goals**

- OAuth / account linking (design documented in §14, not built).
- Elicitation.
- Editing or removing line items; reopening closed orders.
- Customer notifications (SMS, email), multiple locations, employee roles.
- Integrations with POS or real payments; languages other than English.
- Multi-level recipes (only one-level `consumes`, §7.4).

---

## 4. Product

### 4.1 Demo profiles

| | Shop | Bakery |
|---|---|---|
| Fictional business | Oak Street Auto | Sweet Crumb Bakery |
| Order | work order | cake order |
| Asset | vehicle: year, make, model (required), plate (optional) | — |
| Order-specific fields | — | flavor and size (required), inscription (optional) |
| Due date (`due`) | optional | required |
| Stages | estimate → approved → in_bay → waiting_on_parts → ready_for_pickup → picked_up | ordered → baking → decorating → ready → picked_up |
| Closed from | ready_for_pickup | ready |
| Inventory | parts & fluids | ingredients & supplies |

### 4.2 The nine tools

| # | Intent | Shop | Bakery | Example phrase (shop) | Type |
|---|---|---|---|---|---|
| 1 | Daily summary | `get_shop_snapshot` | `get_bakery_snapshot` | "How's the shop looking today?" | read · UI |
| 2 | Find orders | `find_work_orders` | `find_cake_orders` | "What's waiting on parts?" | read |
| 3 | Open order | `open_work_order` | `take_cake_order` | "Open a work order for Dana Lee's 2019 Civic, front brakes" | write |
| 4 | Change stage | `move_work_order_stage` | `move_cake_order_stage` | "Move the Civic to in the bay" | write |
| 5 | Add line item | `add_parts_or_labor` | `add_to_cake_order` | "Add front brake pads to the Civic" | write |
| 6 | Check inventory | `check_parts_stock` | `check_ingredients` | "Do we have 5W-30?" | read |
| 7 | Reorder | `reorder_parts` | `reorder_ingredients` | "Reorder whatever's low" | write |
| 8 | Take payment and close | `close_out_work_order` | `close_out_cake_order` | "Close out the F-150, they paid by card" | write |
| 9 | Sales report | `sales_report` | `sales_report` | "How did we do this week compared to last week?" | read · UI |

### 4.3 Demo script (≤ 3 min, draft)

1. **0:00–0:20** — The problem: the mechanic's hands are busy and the system is on a PC at the back of the shop.
2. **0:20–1:30** — Shop by voice: *"What's waiting on parts?"* → *"Add front brake pads to the Civic"* → *"Move the Civic to in the bay"* → *"Close out the F-150, they paid by card."*
3. **1:30–1:55** — Visual: daily dashboard and sales chart (MCP Apps).
4. **1:55–2:35** — Same server, another profile: *"How many cakes are due Saturday?"* → *"Take a cake order for Priya Shah, a 10-inch chocolate cake, due Saturday"* → *"Reorder whatever's low."*
5. **2:35–3:00** — AWS architecture and close.

---

## 5. Architecture

```
  Echo or Alexa console simulator
          │ voice
          ▼
  Alexa Skill (bridge) ──► Strands agent on Bedrock AgentCore (Nova 2 Lite)
                                   │ MCP · Streamable HTTP · Authorization: Bearer
                                   ▼
          ┌────────────────── Counterpart (ECS Express Mode) ──────────────────┐
          │ http/    /ping · /mcp · token auth · per-business session          │
          │ tools/   registers the business profile's 9 tools in its session   │
          │ domain/  pure rules: orders · inventory · references · reports     │
          │ ui/      MCP Apps: snapshot · sales report                          │
          │ store/   DynamoStore ─────────────────────────► DynamoDB            │
          └─────────────────────────────────────────────────────────────────────┘

  Visuals in the video: ext-apps basic-host ──► same /mcp
```

### 5.1 Units

Each unit has one responsibility, one interface and explicit dependencies. `domain/` does no I/O and is tested without mocks.

| Unit | Responsibility | Main interface | Depends on |
|---|---|---|---|
| `profiles/` | Load and validate YAML profiles | `loadProfile(id): Profile` | zod, yaml |
| `domain/` | Pure business rules | pure functions over types | `profiles` types |
| `store/` | Persistence | `Store` interface; `DynamoStore`, `MemoryStore` | AWS SDK v3 |
| `speech/` | Speakable English text | `say` functions that return `string` | `profiles` types |
| `tools/` | Register a profile's 9 tools on an `McpServer` | `registerTools(server, ctx)` | domain, store, speech, ui |
| `ui/` | Two MCP Apps as single-file HTML | `ui://counterpart/*.html` resources | ext-apps |
| `http/` | Express: `/ping`, `/mcp`, authentication, sessions | `createApp(deps)` | `@modelcontextprotocol/node` |
| `seed/` | Deterministic fictional data per profile | `seed(store, profileId)` | domain, store |
| `infra/` | Image, table, deployment, tokens | scripts | Docker, AWS CLI |

### 5.2 Repo structure

```
counterpart/
├── src/
│   ├── http/       app.ts · auth.ts · sessions.ts
│   ├── tools/      register.ts · snapshot.ts · find.ts · open.ts · move.ts
│   │               add-line.ts · stock.ts · reorder.ts · close-out.ts · sales-report.ts
│   ├── domain/     orders.ts · inventory.ts · resolver.ts · reports.ts · money.ts · dates.ts
│   ├── profiles/   schema.ts · load.ts · auto-repair.yaml · bakery.yaml
│   ├── store/      store.ts · dynamo.ts · memory.ts
│   ├── speech/     say.ts
│   └── ui/         snapshot/ · sales-report/
├── seed/           auto-repair.ts · bakery.ts
├── infra/          Dockerfile · create-table.sh · deploy.sh · create-token.ts
├── test/           unit/ · integration/ · golden/
└── docs/           aws-builder.md · friction-log.md · product-feedback.md · demo-script.md
```

---

## 6. Stack

| Piece | Choice | Reason |
|---|---|---|
| Runtime | Node.js 24 LTS (`node:24-slim` image) | Current LTS |
| Language | TypeScript, ESM, `strict` | The MCP Apps SDK is TypeScript |
| MCP | `@modelcontextprotocol/server` and `@modelcontextprotocol/node` **2.0.0** | ext-apps 2.0.0 requires SDK v2 |
| MCP Apps | `@modelcontextprotocol/ext-apps` **2.0.0** | UI inside the conversation |
| Validation | zod ^4.2 (`zod/v4`) | ext-apps peer; Standard Schema in SDK v2 |
| HTTP | Express | Pattern of the official SDK examples |
| Data | DynamoDB on-demand; DynamoDB Local in Docker for tests | Serverless, free tier |
| UI | Vite, bundled into a single HTML; hand-made SVG charts | No chart library |
| Tests | vitest | — |

**Exact versions** (no `^`) in `package.json` for the MCP packages: SDK v2 has just come out.

**Version Plan B (verified on npm on 2026-09-15):** `@modelcontextprotocol/sdk` 1.30.0 (`LATEST_PROTOCOL_VERSION = "2025-11-25"`) + `@modelcontextprotocol/ext-apps` 1.7.5 (peer `@modelcontextprotocol/sdk ^1.29.0`). It kicks in if spike 2 or 3 hits a blocker in v2.

---

## 7. Detailed design

### 7.1 Sessions and authentication

1. The client sends `POST /mcp` with `Authorization: Bearer <token>` and an `initialize`.
2. `auth.ts` computes the token's SHA-256 and looks up `TOKEN#<hash>` → `businessId`. If the token is missing or does not exist → **HTTP 401**, with no session created.
3. The business and its profile are loaded; an `McpServer` is created, the profile's tools are registered, and a `NodeStreamableHTTPServerTransport` with `sessionIdGenerator: randomUUID` is connected.
4. Requests with `mcp-session-id` are routed to their transport. **Every request revalidates the token and requires it to belong to the same business as the session**: a session id without its token is useless.
5. Sessions idle for more than 30 minutes are closed. The session map lives in memory, so the service runs with **a single task** (§8).

**Tokens:** 32 random bytes in base64url generated by `infra/create-token.ts`. Only the hash is stored in DynamoDB. The plain value is shown once and stored in Secrets Manager for the bridge.

**Local mode without token** (in case basic-host cannot send headers): `COUNTERPART_DEV_BUSINESS=<bizId>` is only accepted if the server listens on `127.0.0.1`. If combined with any other interface, the process refuses to start.

### 7.2 Profiles

YAML files validated with zod at startup. An invalid profile stops startup with the exact error. A profile defines the business's **shape**; prices, inventory and customers are **data** and live in DynamoDB.

```yaml
id: auto-repair
nouns: { order: work order, orders: work orders, item: part, items: parts, customer: customer }
synonyms:
  order: [repair order, RO, ticket, job]
  item: [part, fluid, supply]
toolNames:
  snapshot: get_shop_snapshot
  find: find_work_orders
  open: open_work_order
  move: move_work_order_stage
  addLine: add_parts_or_labor
  stock: check_parts_stock
  reorder: reorder_parts
  closeOut: close_out_work_order
  salesReport: sales_report
stages:
  - { id: estimate, label: estimate }
  - { id: approved, label: approved }
  - { id: in_bay, label: in the bay }
  - { id: waiting_on_parts, label: waiting on parts }
  - { id: ready_for_pickup, label: ready for pickup }
  - { id: picked_up, label: picked up }
closedStage: picked_up
closeFrom: [ready_for_pickup]
asset:
  noun: vehicle
  fields:
    - { id: year, type: integer, required: true }
    - { id: make, type: string, required: true }
    - { id: model, type: string, required: true }
    - { id: plate, type: string, required: false }
  spokenAs: "{year} {make} {model}"
orderFields: []
due: optional
```

**Validation rules**

- `toolNames` unique within the profile and matching `^[a-z][a-z0-9_]{2,63}$`.
- `closedStage` belongs to `stages`; `closeFrom` is a subset of `stages` without `closedStage`.
- The `spokenAs` placeholders are ids from `asset.fields`.
- `due: required` makes `due` mandatory in the open-order tool.

**Tool generation:** the `inputSchema`s are built from the profile (asset fields, `orderFields`, `stages` as an enum). Names come from `toolNames`. Descriptions are generated from English templates using `nouns` and `synonyms`; for example, for opening an order: *"Open a new work order (also called a repair order, RO, ticket or job) for a customer and their vehicle. Use this when the user wants to start a new job."*

### 7.3 Data model (DynamoDB, single table `counterpart`)

| Entity | PK | SK | Main attributes |
|---|---|---|---|
| Token | `TOKEN#<sha256>` | `TOKEN` | businessId, createdAt |
| Business | `BIZ#<bizId>` | `META` | name, profileId, timezone, currency, taxRate, nextOrderNumber, version |
| Customer | `BIZ#<bizId>` | `CUST#<custId>` | name, nameNormalized, phone? |
| Asset | `BIZ#<bizId>` | `ASSET#<assetId>` | customerId, fields{}, spokenLabel |
| Order | `BIZ#<bizId>` | `ORD#<orderId>` | number, customerId, assetId?, stage, fields{}, dueOn?, description?, lines[], subtotalCents, taxCents, totalCents, stageHistory[], createdAt, closedAt?, version |
| Item | `BIZ#<bizId>` | `ITEM#<itemId>` | name, synonyms[], kind (part · labor · product · ingredient · supply), unit, priceCents, taxable, stocked, onHand, reorderPoint, reorderQty, supplierId?, consumes{itemId: qty}, version |
| Supplier | `BIZ#<bizId>` | `SUP#<supId>` | name |
| Purchase order | `BIZ#<bizId>` | `PO#<poId>` | supplierId, lines[{itemId, qty}], status (open · received), createdAt |
| Payment | `BIZ#<bizId>` | `PAY#<YYYY-MM-DD>#<payId>` | orderId, amountCents, method, paidAt |

- **No secondary indexes.** Orders: `Query PK = BIZ#<id> AND begins_with(SK, "ORD#")` and in-memory filtering (a small business has hundreds of orders). Payments by range: `SK BETWEEN "PAY#<from>" AND "PAY#<to>~"`, with the date in the business's time zone.
- **Concurrency:** business, orders and items carry `version`; conditional writes (`version = :expected`) with one retry on conflict.
- **Order number:** `nextOrderNumber` is incremented with a conditional write on `META`.
- **Every write that touches several records is transactional** (`TransactWriteItems`): adding a line item (order + decremented items) and closing (order + payment). That way the internal error message ("Nothing was changed") is always true.
- `lines[]` lives inside the order, capped at 50 line items, well below the 400 KB per-record limit.

### 7.4 Domain rules

- **Customers and assets:** when opening an order, the customer is looked up by exact `nameNormalized` and created if it does not exist. The asset is looked up by customer + required fields and created if it does not exist. If the profile has an asset, the asset is required.
- **Stages:** move accepts any stage except `closedStage`, which is reached only by closing. A closed order cannot be moved. Going backward is allowed on purpose, to correct by voice ("back to in the bay").
- **Line items:** catalog price × quantity (for labor, quantity is hours). If the item is `stocked`, it decrements `onHand`; whatever falls short stays as `backordered` on the line item and the response says so ("only 1 in stock, 1 backordered"). `onHand` is never negative. The item is identified with the §7.5 algorithm applied to the catalog's name and synonyms.
- **`consumes` (one level):** adding "Oil change" decrements 1 oil filter and 5 qt of 5W-30; adding "10-inch round cake" decrements 1 cake box and 1 cake board.
- **Taxes:** the business's `taxRate` on the subtotal of `taxable` line items, rounded half-up once per order.
- **Reorder:** with no item, it takes all `stocked` items with `onHand <= reorderPoint`. Quantity = `reorderQty` + sum of `backordered` on open orders. Groups by supplier into purchase orders. Items with an open purchase order are skipped and reported.
- **Close:** only from `closeFrom`. Records a payment for the total with method `cash`, `card` or `check`, and moves the order to `closedStage`.
- **Money:** integer cents throughout the system; "$412.50" format only when speaking or displaying.
- **Dates:** `due` accepts `today`, `tomorrow`, a weekday (its next occurrence, including today) or `YYYY-MM-DD`, resolved in the business's time zone. Report periods: `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`; weeks run Monday to Sunday.

### 7.5 Spoken references (`domain/resolver.ts`)

Input: free text ("the Civic", "Dana's", "order 42"). Candidates: non-closed orders + orders closed today (so closing twice is idempotent).

1. **Normalize:** lowercase; strip punctuation and `'s`; strip stop words (`the, a, an, mr, mrs, ms, number, no`) and the profile's nouns (`work`, `order`, `cake`, etc.).
2. **Number:** if a number remains that matches a candidate's `number`, that one is picked.
3. **Score** per candidate = query tokens that appear in the customer name, `spokenLabel`, plate, order fields or description ÷ query tokens. Tokens of 5 or more letters tolerate edit distance 1 ("camery" → "camry").
4. **Decision:** if the query ends up empty or the best score is below 0.5 → `NOT_FOUND`. If the second is within 0.15 of the first → `AMBIGUOUS` with up to 5 candidates. Otherwise → the best one.

### 7.6 Inputs per tool

| Tool | Inputs |
|---|---|
| snapshot | none |
| find | `query?` (free text), `stage?` (stage enum), `due?` (§7.4). No filters: open orders. List of at most 10, but `structuredContent.total` always carries the full count |
| open | `customerName`, `customerPhone?`, `asset` (profile fields; only if the profile has an asset), `orderFields` fields, `due` (per the profile), `description?` |
| move | `order` (spoken reference), `stage` (enum) |
| addLine | `order`, `item` (name or synonym), `quantity?` (1 by default) |
| stock | `item?`; with no item, lists what is low |
| reorder | `item?`; with no item, reorders everything that is low |
| closeOut | `order`, `paymentMethod` (`cash` · `card` · `check`) |
| salesReport | `period` (enum from §7.4), `compare?` (`true` by default: against the previous period) |

### 7.7 Response contract

- **`content[0].text`:** one or two English sentences, no markdown, that can be said out loud. Money as "$412.50". Orders are referred to by number ("work order 42"), which is their speakable identifier.
- **`structuredContent`** with an `outputSchema` declared on each tool: stable ids (`orderId`, `number`) and the data the UIs use.
- **MCP annotations:** reads carry `readOnlyHint: true`; move, close and reorder carry `idempotentHint: true`.
- **Domain errors:** `isError: true` with **text only** (no `structuredContent`), saying what happened and what to do. Candidates are listed by number (up to 5) so the user can choose by speaking.

| Code | When | Example text |
|---|---|---|
| `NOT_FOUND` | reference with no match | "I couldn't find an open work order for 'Accord'. Open ones are work orders 41, 44 and 47." |
| `AMBIGUOUS` | §7.5 | "I found two Camrys: work order 41 for Dana Lee and work order 57 for Mark Ortiz. Which one?" |
| `UNKNOWN_ITEM` | the item is not in the catalog | "I don't have 'blinker fluid' in the parts list. Closest matches are brake fluid and washer fluid." |
| `INVALID_STAGE` | closed order, or attempt to move to the closing stage | "Work order 42 is already picked up, so it can't be moved." / "To finish a work order, close it out instead." |
| `CANNOT_CLOSE` | the current stage is not in `closeFrom` | "Work order 42 is still in the bay. Move it to ready for pickup first." |
| `CONFLICT` | version conflict after the retry | "Someone else just updated that work order. Please try again." |
| `INTERNAL` | any other exception (logged with `requestId`) | "Something went wrong on my end. Nothing was changed." |

Invalid parameters are rejected by the SDK with the `inputSchema`; they never bring down the process.

### 7.8 Idempotency

| Tool | Rule |
|---|---|
| open | If an order exists for the same customer, with the same asset and fields, created less than 2 minutes ago, that one is returned |
| move | Moving to the current stage changes nothing and responds with success |
| closeOut | An already closed order returns the existing receipt without recording another payment |
| reorder | Items with an open purchase order are skipped |
| addLine | No deduplication: repeating "add another oil filter" is legitimate |

### 7.9 MCP Apps

| Resource | Tool | Content |
|---|---|---|
| `ui://counterpart/snapshot.html` | snapshot | today's sales vs. the same weekday last week; orders by stage; today's due items; low inventory |
| `ui://counterpart/sales-report.html` | salesReport | daily sales for the period vs. the previous one; total; average ticket; top 5 items |

- Registered with ext-apps' `registerAppTool` / `registerAppResource`. The exact import path in 2.0.0 is confirmed in spike 3.
- The UI receives the data through `structuredContent` (`app.ontoolresult`).
- **The `content` text is always enough on its own:** the bridge and devices without a screen do not show UI.

### 7.10 HTTP and operations

- `GET /ping` → `200 ok` (ECS Express Mode's default health check path).
- `POST`, `GET` and `DELETE` on `/mcp` → the session's transport.
- Open SSE streams send a keep-alive every 15 seconds or less; the load balancer idle timeout goes up to 300 s. The exact mechanism is validated in spike 2.
- JSON logs to stdout (CloudWatch): `requestId`, `sessionId`, `businessId`, tool, duration and error code. Never tokens or full personal data.
- On `SIGTERM`: close sessions and transports before exiting.

---

## 8. Hosting and infrastructure (us-east-1)

Everything lives in us-east-1, the region the bridge requires for Bedrock.

| Resource | Configuration |
|---|---|
| ECR | `counterpart` repository |
| ECS Express Mode | one service, 0.25 vCPU / 0.5 GB, port 3000, health check `/ping`, **minimum and maximum 1 task** |
| Load balancer (created by Express Mode) | HTTPS; idle timeout 300 s |
| DynamoDB | `counterpart` table, on-demand |
| Secrets Manager | demo business tokens for the bridge |
| CloudWatch Logs | 14-day retention |

- **Deployment:** `infra/deploy.sh` builds the image, pushes it to ECR and creates the service with `aws ecs create-express-gateway-service` the first time, or updates the image on later deployments.
- **Express Mode requirement:** default VPC with at least 2 public subnets in 2 availability zones.
- **A single task is a conscious decision:** sessions live in memory. Scaling requires shared sessions or stateless mode; this is documented in the README.
- **Estimated cost:** ~$25–35 per month (load balancer + Fargate; DynamoDB and logs nearly $0), plus the bridge's Bedrock invocations. It fits in the $150 of credits until December 3.

---

## 9. Seed data

Deterministic (fixed seed) and regenerable with `npm run seed -- <profile>`.

- **Shop:** 40 items (12 labor, 28 parts and fluids; 5 below the reorder point), 3 suppliers, 25 customers with a vehicle, 12 open orders spread across all stages, 30 days of payments with a weekly pattern. Exactly one Civic and one F-150 (the ones in the script) and two Camrys (to test ambiguity).
- **Bakery:** 30 items (products, ingredients and supplies; 4 low), 2 suppliers, 20 customers, 10 open orders with `due` in the next 7 days (3 for Saturday), 30 days of payments.

---

## 10. Demo surfaces

### 10.1 Voice: alexa-skill-mcp-bridge

- Open source project (`github.com/KayLerch/alexa-skill-mcp-bridge`). An Alexa Skill acts as the add-on and a Strands agent on Bedrock AgentCore (Amazon Nova 2 Lite) emulates the Alexa+ orchestrator. It calls Counterpart over Streamable HTTP with the token stored in Secrets Manager.
- **Track A** (local agent) to iterate on the golden phrases. **Track C** (Skill) for the video, on an Echo or in the Alexa console simulator.
- Known limitations: no UI, no OAuth, English only, and the model is not Alexa+'s. The README itself warns that it reproduces *"the mechanics of an Alexa+ MCP client, not Alexa's own model judgment."*
- How to switch businesses during the video (update the secret or have two bridge deployments) is decided in spike 4.

### 10.2 Visual: ext-apps basic-host

From `examples/basic-host` in the ext-apps repo: `SERVERS='["http://localhost:3000/mcp"]' npm start` and open `http://localhost:8080`. In the video it is presented as the MCP Apps UI that Alexa+ shows on devices with a screen, without passing it off as an Alexa+ capture.

### 10.3 Cut-off criterion

If spike 1 or 4 does not work by the end of day 1, voice moves to our own web app with a Bedrock agent that calls Counterpart: the *"simulated Alexa+ experience"* the rules accept. **The server does not change.**

---

## 11. Tests

1. **Unit (vitest):** profile schema (valid and invalid); tool and `inputSchema` generation per profile; resolver with a case table (number, name, possessive, typo, ambiguity, empty query); stage transitions; `consumes` and backorder; taxes and rounding; resolution of `due` and periods around week, month and time zone changes.
2. **Integration:** `Client` ↔ `McpServer` with `InMemoryTransport.createLinkedPair()`. Each profile's 9 tools against `MemoryStore` and against `DynamoStore` on DynamoDB Local (Docker). Includes idempotency, simulated version conflicts and error responses.
3. **HTTP contract:** real server locally. `initialize` negotiates `protocolVersion: "2025-11-25"`; no token → 401; another business's token with a valid session id → rejected. Manual review with MCP Inspector.
4. **Golden phrases:** `test/golden/<profile>.yaml` with ~20 phrases per profile, each with the expected tool and its key arguments, run against the bridge's Track A. **Target before recording: 18 of 20 or more per profile.** If they fail, descriptions and synonyms are adjusted, not the logic.

---

## 12. Spikes (day 1)

A toy MCP with a single tool (`ping_shop`) on the chosen stack (SDK v2).

| # | What | Success criterion |
|---|---|---|
| 1 | Bridge Track A against the toy locally | The agent calls `ping_shop` and responds. Confirms access to Bedrock / Nova 2 Lite and the format in which the bridge sends the token |
| 2 | Toy deployed on ECS Express Mode | The service's HTTPS URL responds on `/mcp`; `initialize` negotiates 2025-11-25; an SSE stream stays alive after 60 s |
| 3 | Trivial UI with ext-apps 2.0.0 in basic-host | The UI shows tool data. Confirms the v2 imports and whether basic-host can send auth headers |
| 4 | Bridge Track C (Skill) against the deployed toy | Spoken response in the console simulator. Defines how to switch businesses in the video |

Cut-off: §10.3. If 2 or 3 fail because of SDK v2 → version Plan B (§6).

---

## 13. Hackathon deliverables

- **README:** what it is, architecture, how to run locally (Docker + DynamoDB Local + seed + basic-host), how to deploy and how to connect the bridge.
- **LICENSE:** MIT.
- **`docs/aws-builder.md`:** AWS services used, why, and a diagram (ECS Express Mode, ECR, DynamoDB, Secrets Manager, CloudWatch; the bridge's Bedrock, AgentCore and Lambda).
- **`docs/friction-log.md`** (up to +10%), filled in while building. Initial entries: the Alexa+ CLI is not public; the CLI does not support Windows and requires Node 24+; Cognito omits `code_challenge_methods_supported`; App Runner closed to new customers.
- **`docs/product-feedback.md`**.
- **Video ≤ 3 min** per §4.3, on YouTube.
- **Devpost:** Alexa+ track; AWS Builder and Open Source mini-challenges.

---

## 14. Documented next step: account linking

To publish on real Alexa+ with data separated per business:

- Cognito as an OAuth 2.1 server with PKCE S256 and refresh tokens.
- Counterpart serves `/.well-known/oauth-protected-resource` (`resource`, `authorization_servers`, `scopes_supported`) and responds 401/403 when a valid token is missing.
- Since Cognito omits `code_challenge_methods_supported`, Counterpart publishes its own authorization server metadata document, with `["S256"]` and the Cognito endpoints, and that document is the one listed in `authorization_servers`.
- The OAuth token's `sub` is mapped to `businessId` instead of the current token hash.

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| The bridge does not deploy or Bedrock denies model access | §10.3 cut-off at the end of day 1 |
| The brand-new SDK v2 has bugs | Exact versions; spikes 2 and 3; Plan B with v1.30 + ext-apps 1.7.5 |
| Nova 2 Lite picks the wrong tools (it is not Alexa+'s model) | Golden phrases; synonyms and descriptions; 18/20 threshold |
| Express Mode autoscaling breaks in-memory sessions | Minimum and maximum of 1 task |
| Amazon opens the Toolkit during the hackathon | The server already complies; publishing requires §14 |
| Not enough time before 26 Sep | Cuts in this order: (1) sales report UI, which stays as text; (2) `consumes`; (3) taxes. **Never cut:** the 2 profiles, the 9 tools and the voice demo |

---

## 16. Milestones (15–26 Sep)

| Day | Milestone |
|---|---|
| 1 | Spikes 1–4 |
| 2–3 | `profiles` + `domain` + `MemoryStore`, tests first |
| 4–5 | `tools` + `http` + `DynamoStore` + seeds |
| 6 | MCP Apps |
| 7 | Deployment + bridge + golden phrases |
| 8 | README, docs, video and Devpost submission |

---

## 17. Prerequisites outside the code

- AWS account and request for the hackathon's $150 in credits.
- AWS CLI v2 (not installed today) with a profile in us-east-1.
- Access enabled to the Amazon Nova 2 Lite model in Bedrock (us-east-1).
- Amazon (Alexa) developer account and ASK CLI.
- Node.js 24 LTS locally (22.23 today; the bridge works with 22.18+, so upgrading to 24 is enough).
- Docker Desktop (already installed) and a GitHub account for the public repo (`gh` already installed).
