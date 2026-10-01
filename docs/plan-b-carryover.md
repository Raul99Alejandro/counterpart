# What Plan A leaves open for Plan B

**Status:** Plan A complete on the `feat/core` branch — 92 tests, strict type check clean. Reviewed task by task and with a final review of the whole branch; its wave of fixes is already applied and verified.

## Status after Plan B1 (2026-09-16)

Resolved on the `feat/local-delivery` branch:

- **§1:** `DynamoStore` and `MemoryStore` pass the same contract suite, atomicity included. Payments carry `paidOn`, the business's civil date, and `listPayments` compares that date (no longer the first 10 characters of `paidAt`).
- **§2:** seeding against AWS does not install the demo tokens, and `npm run token` issues real tokens, storing only their hash.
- **§3:** JSON logs to stdout, one line per request and another per tool, correlated by `requestId`; `Sessions.drop()` logs `close()` failures; the `INTERNAL` line goes to stdout.
- **§4:** bakery due dates pinned to the day of the week; seed and close-outs use the business date.
- **§5:** number agreement, singular `notFound`, two sentences in summary and report, reserved ids in profiles, generic asset fields instead of `plate`, `.ts` filter in `copy-assets`, `npm run seed -- --reset`, `toy.ts` out of the image, and -s/-es plurals in spoken references.
- **Final branch review:** an unknown session or one from another business answers 404 (MCP asks for 404 so the client opens a new one); the image fails closed without `COUNTERPART_STORE`, because with `NODE_ENV=production` the in-memory store is rejected; `npm run seed -- --reset` against AWS deletes and reseeds only the demo businesses, without touching the table or the tokens; JSON logs also for errors outside the tools and for aborted requests; the summary's week range is computed in civil dates; the typographic apostrophe in possessives; a cross-business isolation case in the store contract; and DynamoDB Local with `-sharedDb`.

Still open:

- **§2:** `allowedHosts` with the load balancer hostname; real tokens in Secrets Manager; session cap per token.
- **§3:** shipping the logs to CloudWatch.
- **§4:** `this_week` versus `last_week` mid-week; interoperability with `basic-host`, including seeing the two MCP Apps UIs in a real host.
- **§5:** trigger overlap between summary and report (measure it with `test/golden/`, which runs in order, in a single session and with a fresh seed); duplicated thresholds between `findItem` and `resolveOrder`; quantity guards; "closest matches" with score 0; `package.json` boilerplate; and all the "details with limited consequences".
- **Final branch review:** `basic-host` instructions in the README (spec §13); `putPurchaseOrders` without a transaction (a partial failure contradicts the response's "Nothing was changed"); `createdAt` in token rows (spec §7.3); the sales chart without date labels or a previous-period series (spec §7.9); `ui/*/main.ts` and `ui/vite.config.ts` outside the type check; and the different behavior of the two stores for a nonexistent business.

This document exists because the execution workspace (`.superpowers/sdd/`) is ignored by git and is deleted when the plan closes. What must survive stays here.

---

## 1. Invariants the `DynamoStore` has to preserve

Two properties are pinned by tests and the whole tool layer assumes them. `TransactWriteItems` gives them for free; the risk is "simplifying" them when porting.

- **`commitOrderWithItems` validates ALL versions before writing any record.** If anything conflicts, nothing is written. The `memory-store.test.ts` test asserts that the item stays intact after a rejected commit.
- **`listPayments(bizId, from, to)` is an inclusive range of civil dates (`YYYY-MM-DD`) at both ends**, compared on `paidOn`, the civil date of the payment in the business's time zone; never on the `paidAt` instant.

## 2. Security, before deploying

- **`allowedHosts`**: today the server listens on `0.0.0.0` and that disables the SDK's host-header validation; the only thing in front is the bearer token. Configure `allowedHosts` in `createMcpExpressApp` once the load balancer hostname exists.
- **`DEMO_TOKENS` is in plain text** in `seed/run.ts`, and the repo is public as a hackathon requirement. The deployed service must read real tokens from Secrets Manager; those constants must not reach production configuration.
- **There is no session cap per token**: a valid token can open unlimited sessions and only the 30-minute sweep reclaims them.

## 3. The observability gap (spec §7.10)

The JSON logging middleware (`requestId`, `sessionId`, `businessId`, tool, duration, error code) was not built: with no log destination there was no way to verify it. It goes together with CloudWatch, and it also gives two places that are silent today somewhere to report:

- `Sessions.drop()` swallows `close()` errors without logging anything.
- The `guard()` in `context.ts` writes the JSON line to **stderr**; spec §7.10 says stdout. Pick one when building the middleware.

## 4. Things that directly affect the video

- **The sales report panel (MCP Apps, §7.9) needs a non-empty `topItems`.** It already is: the seed generates real line items. Do not revert that or the UI will be designed against an empty state.
- **The bakery dates depend on the day of seeding.** The script line "3 cakes for Saturday" is only true if the server starts on a Tuesday. Pin the due dates to a real day-of-week calculation before recording.
- **`this_week` versus `last_week` mid-week** compares 2-3 elapsed days against 7 full ones, which produces huge apparent drops. The spec asks for it that way; for the video it is better to compare equivalent days.
- **The seed computes dates in UTC**, not in `business.timezone`. If the server is seeded between 19:00 and 24:00 Chicago time, the seed's "today" is one day ahead of the "today" the tools read.
- **Interop with a third-party MCP host is still unverified.** The manual check with `basic-host` could not be done (external repo not cloned); the equivalent was verified over direct HTTP. Any conformance detail that trips on another client implementation would only show up there.

## 5. Minor debt, triaged as "can wait"

None of these block anything; they are ordered by what is cheapest to fix while touching the file.

**Speech and text**
- Number agreement: "but only 2 **was** in stock", and "only 0 was in stock" when nothing is left. A `was/were` helper fixes it.
- `notFound` says "Open ones are" even with a single open order.
- `snapshot` and `salesReport` emit three or four sentences, against the one-or-two rule of §7.7 that was applied to `lineAdded`. Either relax the rule in the spec or trim those two.
- The `snapshot` and `salesReport` triggers overlap for "how did today go". It can only be measured with the golden phrases: it is input for that pass.

**Profiles and domain**
- `parseProfile` does not reserve the ids `due`, `asset`, `customerName`, `customerPhone` or `description`: an `orderFields` with one of those names would silently overwrite the field. Three lines of guard, and profiles are the extension point.
- `resolver.ts` hardcodes the field name `plate`, which is shop vocabulary; `Object.values(asset.fields)` is generic and strictly better. (The spec names it too, so it is a spec leak as much as a code leak.)
- The 0.5 / 0.15 thresholds are duplicated between `findItem` and `resolveOrder`. Extract a single `pickBest` — it is the same kind of drift that already caused an important finding.
- `addLineToOrder` does not reject quantities ≤ 0 (unreachable from MCP, because the schema uses `positive()`), and `planReorder` sets no floor if `reorderQty` were ≤ 0.
- `findItem` returns the top three as "closest matches" even when all score 0.

**Infrastructure and packaging**
- `infra/copy-assets.mjs` also copies the `.ts` files to `dist/`; it is missing `filter: p => !p.endsWith('.ts')`. Do it together with the Dockerfile.
- The `npm run seed -- <profile>` script that spec §9 asks for is missing; today seeding only happens at startup.
- `src/toy.ts` is still compiled even though nothing in the real server uses it. It is the target of the Plan B spikes: keep it out of the Docker image.
- `package.json` keeps `npm init` boilerplate (`main`, `directories`, empty description and author), `"private"` as a string instead of a boolean, and `@types/node` at `^22` against `engines.node >= 24`.

**Details with limited consequences**
- `close-out.ts` in the `alreadyClosed` branch returns the *requested* payment method, not the one that was recorded.
- `takeOrderNumber` consumes the number before writing the order: a failed write burns a number and the numbering is not continuous.
- Each `/mcp` request with a valid token but no session id or `initialize` builds an `McpServer` and a transport that nobody closes, and reads and parses the profile YAML from disk again. Cache the profile.
- `moveStage` has a `closed` branch that is dead code from `move.ts` (which already filters open orders), but it is public domain API.
- The 2-minute dedup window is only tested inside it; the edge (just before and just after) is not.

## 6. Two deliberate decisions that are NOT debt

- **`find` has no order-number shortcut**, unlike `resolveOrder`. Adding it would change the contract of the `find` filter; it does not fix any drift.
- **The seed does not include an F-150**: the end-to-end test opens one, and two would make the phrase "the F-150" ambiguous. The video script uses Nina Patel's Mazda CX-5, which is seeded as ready for pickup.
