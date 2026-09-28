import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { registerTools } from '../../src/tools/context.js';
import { seedAll } from '../../seed/run.js';
import { toolContext } from '../helpers/context.js';

const START = new Date('2026-09-15T15:00:00Z');

async function connect(clock: { now: Date }): Promise<Client> {
  const store = new MemoryStore();
  await seedAll(store, START);
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  let n = 0;
  registerTools(server, await toolContext(store, 'shop', { now: () => clock.now, newId: p => `${p}-${++n}` }));
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'dedup', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

const open = (client: Client) => client.callTool({
  name: 'open_work_order', arguments: { customerName: 'Sam Reyes', asset: { year: 2020, make: 'Ford', model: 'F-150' } }
});
const orderId = (r: { structuredContent?: unknown }) => (r.structuredContent as { orderId: string }).orderId;

describe('ventana de idempotencia de open (§7.8), en su borde', () => {
  it('a 1 min 59 s es la misma orden', async () => {
    const clock = { now: START };
    const client = await connect(clock);
    const first = orderId(await open(client));
    clock.now = new Date(START.getTime() + 119_000);
    expect(orderId(await open(client))).toBe(first);
  });

  it('a 2 min 1 s es una orden nueva', async () => {
    const clock = { now: START };
    const client = await connect(clock);
    const first = orderId(await open(client));
    clock.now = new Date(START.getTime() + 121_000);
    expect(orderId(await open(client))).not.toBe(first);
  });
});
