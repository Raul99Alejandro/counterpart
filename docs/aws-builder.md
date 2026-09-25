# AWS architecture

Counterpart runs on AWS in `us-east-1`. This page lists the AWS services it uses, what each one does, and why we chose it.

```
Alexa developer console simulator (voice)
   ├─ "open oak street auto"     ─► Alexa Skill ─► AWS Lambda ─┐  one bridge stack per business
   └─ "open sweet crumb bakery"  ─► Alexa Skill ─► AWS Lambda ─┤  (AWS CDK)
                                                               ▼
                         Strands agent on Amazon Bedrock AgentCore Runtime
                         model: Amazon Nova 2 Lite (Amazon Bedrock) · AgentCore Memory
                                                               │ MCP · Streamable HTTP · bearer token
                                                               │ token read from AWS Secrets Manager
                                                               ▼
            ┌───────────── Amazon ECS Express Mode (HTTPS, load balancer, 1 task) ─────────────┐
            │  Counterpart container (image in Amazon ECR)                                     │
            │  /mcp: Host allow-list · token → business · 10 sessions per business              │
            └───────────────┬───────────────────────────────────────────┬──────────────────────┘
                            ▼                                           ▼
             Amazon DynamoDB (one table, on demand)        Amazon CloudWatch Logs (JSON lines)
```

| Service | What it does here | Why |
|---|---|---|
| **Amazon ECS Express Mode** | Runs the Counterpart container behind an HTTPS endpoint with a managed load balancer, health check on `/ping`, exactly one task. | One command creates the service, the load balancer and the certificate. AWS App Runner closed to new customers in April 2026. |
| **Amazon ECR** | Stores the container image, tagged with the git commit. | Where Express Mode pulls the image from. |
| **Amazon DynamoDB** | Single table for businesses, customers, orders, items, purchase orders and payments. | On-demand billing costs almost nothing for a demo, and transactions keep "add a line" and "close out" atomic. |
| **AWS Secrets Manager** | Holds each business's bearer token (`counterpart/<business>/token`). The bridge reads it at startup; DynamoDB keeps only the token's SHA-256. | The repo is public, so no token lives in code or configuration. |
| **Amazon CloudWatch Logs** | One JSON line per request and per tool call, with request id, session, business, tool, duration and error code. 14-day retention. | Enough to trace a failed spoken request during a recording. |
| **AWS IAM** | Three roles: task execution, task (read and write on one table, and invoke Nova 2 Lite for the setup assistant), and the Express Mode infrastructure role. | Least privilege for the running code. |
| **Amazon Bedrock (Nova 2 Lite)** | The model that picks a tool and fills its arguments from what the user said. Measured with our golden phrases: 22/22 for the auto shop, 21/23 for the bakery. | The model the Alexa+ track suggests for emulating Alexa+. |
| **Amazon Bedrock AgentCore** | Runtime for the agent that emulates the Alexa+ orchestrator, plus Memory for conversation context across turns. | Billed only while it works; no server to keep running. |
| **AWS Lambda** | The Alexa Skill endpoint of each bridge. It only accepts calls from its own Skill. | The standard Alexa Skill backend. |
| **AWS CloudFormation / CDK** | Deploys each bridge stack. | The bridge ships as a CDK app. |

## Design notes

- **One table, no secondary indexes.** Every business's records share a partition (`BIZ#<id>`), and payments are keyed by the business's calendar date (`PAY#<YYYY-MM-DD>#<id>`), so a sales report is a single key-range query.
- **Optimistic concurrency.** Orders, items and businesses carry a version. Every write to them is conditional, and a conflict is spoken back to the user as "Someone else just updated work order 42. Please try again."
- **One task by design.** MCP sessions live in memory, so the service runs a single task. Scaling out would need shared sessions or stateless mode.
- **Host validation only on `/mcp`.** The load balancer's health check calls `/ping` with the task's IP as `Host`, so validating the whole app would take the service down.
- **Two-step first deploy.** The public hostname exists only after the service is created: the first revision starts with `/mcp` closed (`COUNTERPART_ALLOWED_HOSTS=bootstrap`), and the second allows exactly that hostname.
- **One Skill per business.** Each business gets its own bridge stack and Alexa Skill, the way each would install its own Alexa+ add-on. Our fork of the bridge reads the stack and invocation names from `.env`.

## Deploy and tear down

```bash
npm run deploy                       # ECR, DynamoDB, logs, IAM, ECS Express Mode; prints the /mcp URL
npm run teardown -- --yes            # removes all of it and checks nothing is left
```

Both are covered in the [README](../README.md#deploy-to-aws). The bridge stacks come down with `npm run destroy` in each bridge clone.

## Cost

About $1 a day while the service runs: the load balancer and its public IPs are most of it, plus a small Fargate task. DynamoDB, ECR, logs, secrets, Lambda and AgentCore add cents, and Nova 2 Lite costs cents per hundred requests. The whole hackathon fits in the $150 of hackathon credits; the stack comes down right after the submission deadline.
