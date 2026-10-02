// Reliability battery for the judges' demo: runs the demo script many times against the real Nova
// agent, through the same HTTP API the page uses, and checks every turn.
//   npx tsx infra/demo-battery.ts [runs] [parallel]     (AWS_PROFILE with Bedrock access)
// Writes docs/evidence/demo-battery.json.
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { createApp } from '../src/http/app.js';
import { MemoryStore } from '../src/store/memory.js';
import { DemoLimits } from '../src/demo/limits.js';
import { agentConverse } from '../src/demo/agent.js';
import { bedrockConverse, novaDraftGenerator } from '../src/setup/generate.js';

const runs = Number(process.argv[2] ?? 10);
const parallel = Number(process.argv[3] ?? 3);
const modelId = process.env.COUNTERPART_SETUP_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';

interface Call { tool: string; arguments: Record<string, unknown>; isError: boolean; result: string }
interface Turn { reply: string; calls: Call[]; business: { name: string; status: string } }
interface Step {
  say: string;
  /** The tool that must be called this turn (a prefix for tools named by the voice setup). */
  tool: string;
  /** Text the spoken reply must contain. */
  expect?: RegExp;
  /** Wait before this turn (the setup draft runs in the background). */
  waitMs?: number;
  /** Extra check on the turn. */
  check?: (t: Turn) => string | null;
}

const closedWithoutQuestion = (t: Turn): string | null =>
  t.calls.some(c => c.tool.startsWith('close_out') && /^Closed/.test(c.result)) ? 'charged in the same turn as the question' : null;

const SCRIPT: Record<'shop' | 'bakery' | 'blank', Step[]> = {
  shop: [
    { say: "How's the shop looking today?", tool: 'get_shop_snapshot', expect: /taken in \$[\d,]+\.\d\d/ },
    { say: "What's waiting on parts?", tool: 'find_work_orders', expect: /red SUV.*gray coupe/ },
    { say: 'Add front brake pads to the blue sedan.', tool: 'add_parts_or_labor', expect: /\$253\.71/ },
    { say: 'Move the blue sedan into the bay.', tool: 'move_work_order_stage', expect: /in the bay/ },
    { say: 'Close out the silver crossover, they paid by card.', tool: 'close_out_work_order', expect: /\$110\.00\. Should I close it out by card\?/, check: closedWithoutQuestion },
    { say: 'Yes.', tool: 'close_out_work_order', expect: /Closed work order 47.*\$110\.00 by card/ },
    { say: 'How did last week go?', tool: 'sales_report', expect: /\$[\d,]+\.\d\d/ }
  ],
  bakery: [
    { say: 'What cakes are due Saturday?', tool: 'find_cake_orders', expect: /cake order/i },
    { say: 'Cake order for Ana Ruiz, chocolate, 8-inch, Saturday.', tool: 'take_cake_order', expect: /Opened cake order/ },
    { say: 'Are we low on anything?', tool: 'check_ingredients', expect: /low|left/i }
  ],
  blank: [
    { say: "I run a flower shop. We take orders for bouquets and centerpieces, then we arrange them, and they're ready for pickup or delivered.", tool: 'set_up_my_business', expect: /drafting/ },
    { say: 'What did you come up with?', tool: 'review_business_setup', expect: /Should I turn it on\?/, waitMs: 15_000 },
    { say: 'Yes, go ahead and turn it on.', tool: 'activate_business_setup', expect: /is ready/, waitMs: 5_000, check: t => t.business.status === 'active' ? null : 'not active after yes' },
    { say: 'Take an order for Maria Lopez, a dozen roses for Friday.', tool: 'take_', expect: /Opened .* for Maria Lopez/ },
    { say: 'What bouquet orders are due Friday?', tool: 'find_', expect: /Maria Lopez/ }
  ]
};

const store = new MemoryStore();
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const limits = new DemoLimits({
  sandboxesPerIpPerHour: 1000, sandboxesPerDay: 1000, turnsPerSandboxPerDay: 1000, turnsPerDay: 10_000,
  speechPerSandboxPerDay: 0, speechPerDay: 0
});
const app = createApp({
  store, host: '127.0.0.1', generate: novaDraftGenerator(bedrockConverse(bedrock, modelId)),
  demo: { converse: agentConverse(bedrock, modelId), limits }
});
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/demo/api`;

const post = async <T>(route: string, body: unknown): Promise<T> => {
  const res = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${route} ${res.status}`);
  return res.json() as Promise<T>;
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Result { run: number; business: string; say: string; ok: boolean; problems: string[]; tools: string[]; reply: string }

async function oneRun(run: number): Promise<Result[]> {
  const sandbox = await post<{ businesses: Array<{ kind: 'shop' | 'bakery' | 'blank'; token: string }> }>('/sandbox', {});
  const results: Result[] = [];
  for (const b of sandbox.businesses) {
    const history: Array<{ role: string; text: string; calls?: Call[] }> = [];
    for (const step of SCRIPT[b.kind]) {
      if (step.waitMs) await sleep(step.waitMs);
      const problems: string[] = [];
      let turn: Turn | null = null;
      try {
        turn = await post<Turn>('/turn', { token: b.token, text: step.say, history: history.slice(-12) });
      } catch (err) {
        problems.push(String(err));
      }
      if (turn) {
        const tools = turn.calls.map(c => c.tool);
        if (!tools.some(t => t === step.tool || (step.tool.endsWith('_') && t.startsWith(step.tool)))) {
          problems.push(`expected ${step.tool}, got ${tools.join(', ') || 'no tool'}`);
        }
        if (step.expect && !step.expect.test(turn.reply)) problems.push(`reply did not match ${step.expect}`);
        const extra = step.check?.(turn);
        if (extra) problems.push(extra);
        history.push({ role: 'user', text: step.say }, { role: 'assistant', text: turn.reply, calls: turn.calls });
      }
      results.push({
        run, business: b.kind, say: step.say, ok: problems.length === 0, problems,
        tools: turn?.calls.map(c => c.tool) ?? [], reply: turn?.reply ?? ''
      });
      console.log(`${problems.length ? 'FAIL' : 'ok  '} run ${run} ${b.kind}: ${step.say}${problems.length ? ` — ${problems.join('; ')} — "${turn?.reply ?? ''}"` : ''}`);
    }
  }
  return results;
}

const all: Result[] = [];
const queue = Array.from({ length: runs }, (_, i) => i + 1);
await Promise.all(Array.from({ length: parallel }, async () => {
  for (let run = queue.shift(); run !== undefined; run = queue.shift()) all.push(...await oneRun(run));
}));
server.close();

const passed = all.filter(r => r.ok).length;
const byStep = new Map<string, { ok: number; total: number }>();
for (const r of all) {
  const key = `${r.business}: ${r.say}`;
  const s = byStep.get(key) ?? { ok: 0, total: 0 };
  s.total += 1; if (r.ok) s.ok += 1;
  byStep.set(key, s);
}
console.log(`\n${passed}/${all.length} turns passed over ${runs} runs (model ${modelId})`);
for (const [step, s] of byStep) console.log(`${String(s.ok).padStart(3)}/${s.total}  ${step}`);

const out = path.join(import.meta.dirname, '..', 'docs', 'evidence', 'demo-battery.json');
fs.writeFileSync(out, JSON.stringify({
  date: new Date().toISOString(), modelId, runs, passed, total: all.length,
  steps: Object.fromEntries(byStep), failures: all.filter(r => !r.ok)
}, null, 2) + '\n');
console.log(`Written ${out}`);
