import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { parse as parseYaml } from 'yaml';
import { resolveOrder } from '../../src/domain/resolver.js';
import { createApp } from '../../src/http/app.js';
import { ProfileCache } from '../../src/profiles/cache.js';
import { loadRefs } from '../../src/tools/context.js';
import { MemoryStore } from '../../src/store/memory.js';
import { DEMO_TOKENS, seedAll } from '../../seed/run.js';
import { runGolden, type Canonicalize, type ConverseFn, type GoldenPhrase } from './runner.js';

// Uso: npm run golden -- <auto-repair|bakery>   (con AWS_PROFILE y acceso a Nova 2 Lite)
// Siembra un servidor local nuevo, corre las frases en orden y escribe build/golden/<perfil>.json.
const TOKEN_BY_PROFILE: Record<string, string> = { 'auto-repair': DEMO_TOKENS.shop, bakery: DEMO_TOKENS.bakery };
const BUSINESS_BY_PROFILE: Record<string, string> = { 'auto-repair': 'shop', bakery: 'bakery' };
const profile = process.argv[2] ?? '';
const token = TOKEN_BY_PROFILE[profile];
if (!token) { console.error('Uso: npm run golden -- <auto-repair|bakery>'); process.exit(1); }

const modelId = process.env.GOLDEN_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const model: ConverseFn = async ({ system, messages, toolConfig }) => {
  const out = await bedrock.send(new ConverseCommand({
    modelId, system, messages, toolConfig, inferenceConfig: { maxTokens: 400, temperature: 0 }
  }));
  return out.output!.message!;
};

const store = new MemoryStore();
await seedAll(store);
const startedAt = new Date().toISOString();

// Una referencia a una orden ("the Civic", "work order 41") se compara por la orden a la que la
// resuelven las tools: órdenes abiertas y las que esta corrida cerró. Si no resuelve a una sola, queda el texto.
const business = (await store.getBusiness(BUSINESS_BY_PROFILE[profile]!))!;
const toolCtx = { business, profile: await new ProfileCache(store).forBusiness(business), store, now: () => new Date(), newId: (p: string) => p };
const canonicalize: Canonicalize = async args => {
  if (typeof args.order !== 'string') return args;
  const refs = (await loadRefs(toolCtx)).filter(r =>
    r.order.stage !== toolCtx.profile.closedStage || (r.order.closedAt ?? '') >= startedAt);
  const found = resolveOrder(args.order, refs, toolCtx.profile);
  return found.kind === 'one' ? { ...args, order: `order #${found.ref.order.id}` } : args;
};
const server = createApp({ store, host: '127.0.0.1' }).listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', () => resolve()));
const client = new Client({ name: 'counterpart-golden', version: '0.1.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`), {
  fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }
}));

const file = path.join(import.meta.dirname, '..', '..', 'test', 'golden', `${profile}.yaml`);
const { phrases } = parseYaml(fs.readFileSync(file, 'utf8')) as { phrases: GoldenPhrase[] };
const report = await runGolden({ client, model, phrases, canonicalize });
await client.close();
server.close();

for (const r of report.results) {
  console.log(`${r.pass ? 'ok  ' : 'FAIL'} "${r.say}" → ${r.got ?? '(ninguna)'}${r.pass ? '' : ` (esperada ${r.expected}) ${JSON.stringify(r.gotArgs ?? {})}`}`);
  if (!r.pass && r.got === null && r.reply) console.log(`       modelo: ${r.reply.slice(0, 200)}`);
}
const ratio = report.passed / report.total;
console.log(`\n${profile}: ${report.passed}/${report.total} (${Math.round(ratio * 100)}%) · modelo ${modelId} · modo converse`);

const outDir = path.join(import.meta.dirname, '..', '..', 'build', 'golden');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${profile}.json`), JSON.stringify({ modelId, mode: 'converse', ...report }, null, 2));
// Meta del spec: 18 de 20 o más, es decir, 90%.
process.exit(ratio >= 0.9 ? 0 : 1);
