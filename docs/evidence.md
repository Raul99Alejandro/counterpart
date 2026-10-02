# Evidence: latency, cost and tool choice

Measured on the deployed system (AWS us-east-1) on October 1, 2026, at commit `cbee84d`. Each section says where the number comes from and how to measure it again.

## Summary

| What | Result | Source |
|---|---|---|
| Business tool latency on AWS | median **48 ms**, p95 **294 ms**, max **494 ms** over 105 real calls; **none above 500 ms** | CloudWatch Logs, the server's own `durationMs` per tool call |
| Tool choice | **22/22** (auto shop) and **23/23** (bakery) spoken phrases pick the right tool and arguments with Nova 2 Lite | `npm run golden`, results in [evidence/](evidence/) |
| Cost of a voice turn | about **$0.0027**: 2 Nova 2 Lite calls, ~7,500 input and ~62 output tokens | Bedrock CloudWatch metrics during the golden run |
| Cost of setting up a business by voice | about **$0.006** per draft: 1 Nova 2 Lite call, ~3,100 input and ~1,700 output tokens; 5.2–11 s, which is why it runs in the background | Bedrock CloudWatch metrics, 3 drafts |
| Hosting | about **$1.65 a day** fixed (load balancer, public IPv4, Fargate task), plus usage | AWS Cost Explorer, September 25–30 |
| End-to-end check | 6/6 smoke checks against the deployed `/mcp` | `npm run smoke` |
| Judges' demo reliability | **150/150** turns correct over 10 full runs of the demo script (auto shop with the two-step close-out, bakery, and a flower shop set up by voice): right tool, exact amounts, and no payment without the owner's yes | `infra/demo-battery.ts`, results in [evidence/demo-battery.json](evidence/demo-battery.json) |

At these prices, a shop that talks to Counterpart 100 times a day spends about **$0.27 a day on the model**, and setting up a new business costs less than a cent.

## Demo reliability

`npx tsx infra/demo-battery.ts 10 3` starts the server with the real Nova 2 Lite agent and runs the judges' demo script ten times, three runs at a time, through the same HTTP API the page uses. Every turn must call the expected tool and say the expected words: the exact amounts ($253.71, $110.00), the two-step close-out (the question, then "Closed…" only after the owner's "Yes." in the next turn), and the voice setup through to the new business's first order. Result on October 2, 2026: **150/150 turns** ([evidence/demo-battery.json](evidence/demo-battery.json)).

The first run of this battery found a real bug: a "yes" given right after the question was refused, because the server only knew the time since the question. The demo now tells the server when each turn begins, so the owner's yes in the next turn always counts and the model can never confirm a payment in the same turn.

## Tool latency

Every tool call writes one JSON log line with `tool`, `businessId` and `durationMs` (`src/tools/instrument.ts`). This is the time inside Counterpart, from the request to the answer, including DynamoDB.

CloudWatch Logs Insights over `/ecs/counterpart`, September 25 – October 1, 2026, business tools only:

```
filter msg = "tool" and tool not like /business_setup|set_up_my_business/
| stats count(*) as calls, pct(durationMs, 50) as p50, pct(durationMs, 90) as p90, pct(durationMs, 95) as p95, max(durationMs) as maxMs
```

| Calls | p50 | p90 | p95 | Max | Above 500 ms |
|---|---|---|---|---|---|
| 105 | 48 ms | 229 ms | 294 ms | 494 ms | 0 |

By tool (p50 / p95): `find_work_orders` 29 / 105 ms, `get_shop_snapshot` 104 / 494 ms, `sales_report` 23 / 294 ms, `add_parts_or_labor` 79 / 137 ms, `close_out_work_order` 82 / 353 ms, `move_work_order_stage` 21 / 96 ms, `take_bouquet_order` 163 / 316 ms.

The setup tools are excluded on purpose: `review_business_setup` waits up to 20 s for a draft in progress, so the agent checks once instead of polling in a loop (friction log #20). `set_up_my_business` itself answers in 14 ms (p50) because it only starts the draft.

## Tool choice

`npm run golden -- auto-repair` and `npm run golden -- bakery` seed a fresh local server, send each phrase in `test/golden/` to Nova 2 Lite with the tools the server exposes, run the tool it picks, and compare the tool and its arguments with the expected ones. Phrases run in order, so later ones see the effects of earlier ones ("move it into the bay" after "add brake pads").

| Profile | Result | File |
|---|---|---|
| Auto shop | 22/22 | [evidence/golden-auto-repair.json](evidence/golden-auto-repair.json) |
| Bakery | 23/23 | [evidence/golden-bakery.json](evidence/golden-bakery.json) |

Each file has every phrase, the expected and chosen tool, the arguments and the spoken reply.

## Model cost

Prices: Amazon Nova 2 Lite on-demand in US East, from the AWS Price List API (`USE1-Nova2.0Lite-input-tokens`, `USE1-Nova2.0Lite-output-tokens`): **$0.33 per million input tokens, $2.75 per million output tokens**.

Token counts come from the `AWS/Bedrock` CloudWatch metrics (`Invocations`, `InputTokenCount`, `OutputTokenCount`, model `us.amazon.nova-2-lite-v1:0`), read before and after each measurement with nothing else running.

| Measurement | Model calls | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| 45 golden phrases (one voice turn each) | 90 | 339,540 | 2,807 | $0.120, so **$0.0027 per turn** |
| 3 setup drafts (flower shop) | 3 | 9,384 | 5,201 | $0.017, so **$0.0058 per draft** |

A voice turn is two calls: one to pick the tool, one to phrase the answer. Most of the input is the nine tool definitions, which is why the descriptions are worth keeping tight. Nova's average latency during the run was 875 ms per call.

The golden runner calls Nova the way the bridge's agent does: Converse with the server's tools, a short system prompt, and the conversation so far, so the 7,500 input tokens include a growing history over 22–23 turns. The bridge's agent has a longer system prompt, so a real turn costs a little more; at these prices the difference is a fraction of a cent.

## Hosting cost

AWS Cost Explorer, unblended cost without credits, September 2026 (the system ran from September 25):

| Service | Cost |
|---|---|
| Amazon VPC (public IPv4 addresses) | $4.91 |
| Elastic Load Balancing | $3.18 |
| Amazon ECS (Fargate) | $1.74 |
| Amazon Bedrock AgentCore (three bridges) | $1.59 |
| Amazon Bedrock (Nova 2 Lite, including all development and testing) | $1.40 |
| AWS Secrets Manager | $0.18 |
| Amazon DynamoDB | $0.01 |

That is about $2 a day during six days of heavy development and testing. The fixed part, which runs with no traffic, is the load balancer, the public IPv4 addresses and one Fargate task: about $1.65 a day. One deployment serves any number of businesses, each with its own token, so a business's share is mostly its model usage.

`npm run teardown -- --yes` removes everything.
