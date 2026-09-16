# AWS architecture

Counterpart is built to run on AWS. This page lists which AWS services it uses, why, and what is already in place.

```
Alexa device or console simulator
        │ voice
        ▼
Alexa Skill (bridge) ──► Strands agent on Amazon Bedrock AgentCore (Amazon Nova 2 Lite)
                                 │ MCP · Streamable HTTP · bearer token
                                 ▼
              Counterpart container on Amazon ECS Express Mode (image in Amazon ECR)
                                 │
                                 ▼
                         Amazon DynamoDB (single table)
```

| Service | Role | Status |
|---|---|---|
| Amazon DynamoDB | Single-table store for businesses, customers, orders, items, purchase orders and payments. Transactions keep "add a line" and "close out" atomic. | Implemented and tested against DynamoDB Local |
| Amazon ECS Express Mode | Runs the container behind HTTPS with a load balancer. Chosen over AWS App Runner, which closed to new customers in April 2026. | Container image built; deployment in progress |
| Amazon ECR | Stores the container image. | In progress |
| AWS Secrets Manager | Holds each business's bearer token for the voice bridge. Only token hashes are stored in DynamoDB. | In progress |
| Amazon CloudWatch Logs | Receives the server's structured JSON logs (one line per request and per tool call). | Logs implemented; shipping in progress |
| Amazon Bedrock and Bedrock AgentCore | Run the agent that emulates the Alexa+ orchestrator and chooses which tool to call. | In progress |
| AWS Lambda | Hosts the Alexa Skill endpoint of the bridge. | In progress |

## Design notes

- **One table, no secondary indexes.** Every business's records share a partition (`BIZ#<id>`), and payments are keyed by the business's calendar date (`PAY#<YYYY-MM-DD>#<id>`), so a sales report is a single key-range query.
- **Optimistic concurrency.** Orders, items and businesses carry a version. Every write to them is conditional, and a conflict is spoken back to the user as "Someone else just updated work order 42. Please try again."
- **One task by design.** MCP sessions live in memory, so the service runs a single task. Scaling out would need shared sessions or stateless mode.
- **Cost.** Roughly $25–35 a month, mostly the load balancer, plus Bedrock usage for the bridge.
