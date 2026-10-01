import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

// Spike S4: how long Nova 2 Lite takes to generate a business draft (profile + catalog)
// with forced tool use. Usage: npx tsx infra/spikes/nova-latency.ts [runs]
const runs = Number(process.argv[2] ?? 5);
const modelId = process.env.NOVA_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

const description = 'I run a flower shop. We make arrangements for weddings and events. '
  + 'Orders get designed, then arranged, then they are ready for pickup. '
  + 'We stock roses, lilies, tulips, vases, ribbon and floral foam.';

// A schema about the size of the real one (profile + catalog): what matters here is the timing.
const schema = {
  type: 'object',
  required: ['nouns', 'stages', 'items'],
  properties: {
    nouns: { type: 'object', properties: { order: { type: 'string' }, item: { type: 'string' } }, required: ['order', 'item'] },
    stages: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } }, required: ['id', 'label'] } },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'kind', 'priceCents'],
        properties: {
          name: { type: 'string' }, kind: { type: 'string', enum: ['product', 'labor', 'supply', 'ingredient', 'part'] },
          priceCents: { type: 'integer' }, onHand: { type: 'integer' }, reorderPoint: { type: 'integer' }
        }
      }
    }
  }
};

const times: number[] = [];
for (let i = 0; i < runs; i += 1) {
  const started = performance.now();
  const out = await client.send(new ConverseCommand({
    modelId,
    system: [{ text: 'You configure order-based small businesses. Call the tool exactly once.' }],
    messages: [{ role: 'user', content: [{ text: description }] }],
    toolConfig: {
      tools: [{ toolSpec: { name: 'draft_business', description: 'Draft the business setup', inputSchema: { json: schema } } }],
      toolChoice: { tool: { name: 'draft_business' } }
    }
  }));
  const ms = Math.round(performance.now() - started);
  times.push(ms);
  const used = out.output?.message?.content?.some(block => 'toolUse' in block && block.toolUse);
  console.log(`run ${i + 1}: ${ms} ms, tool use: ${used ? 'yes' : 'no'}`);
}

times.sort((a, b) => a - b);
const pct = (p: number) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)];
console.log(`p50 ${pct(50)} ms · p95 ${pct(95)} ms · n=${times.length}`);
