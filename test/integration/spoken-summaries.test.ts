import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { templateRecord } from '../../src/profiles/load.js';
import { registerTools } from '../../src/tools/context.js';
import { toolContext } from '../helpers/context.js';
import { seedAll } from '../../seed/run.js';
import type { Business, Order } from '../../src/domain/types.js';

const NOW = new Date('2026-09-15T15:00:00Z');
const sentences = (t: string): number => t.trim().split(/(?<=[.!?])\s+/).length;
const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

async function connectTo(store: MemoryStore, bizId: string): Promise<Client> {
  let n = 0;
  const ctx = await toolContext(store, bizId, { now: () => NOW, newId: p => `${p}-${++n}` });
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

describe('resúmenes hablados', () => {
  for (const [bizId, snapshotTool] of [['shop', 'get_shop_snapshot'], ['bakery', 'get_bakery_snapshot']] as const) {
    it(`${bizId}: el resumen y los reportes caben en dos oraciones`, async () => {
      const store = new MemoryStore();
      await seedAll(store, NOW);
      const client = await connectTo(store, bizId);

      expect(sentences(text(await client.callTool({ name: snapshotTool, arguments: {} })))).toBeLessThanOrEqual(2);
      for (const period of ['today', 'this_week', 'last_month'] as const) {
        const r = await client.callTool({ name: 'sales_report', arguments: { period } });
        expect(sentences(text(r))).toBeLessThanOrEqual(2);
      }
      await client.close();
    });
  }

  it('dice "1 sale", no "1 sales"', async () => {
    const store = new MemoryStore();
    const business: Business = {
      id: 'b1', name: 'Oak Street Auto', status: 'active', profileVersion: 1,
      timezone: 'America/Chicago', taxRateBps: 0, nextOrderNumber: 1, version: 1
    };
    await store.putBusiness(business);
    await store.putProfile(business.id, templateRecord('auto-repair'));
    const order: Order = {
      id: 'o1', number: 1, customerId: 'c1', stage: 'picked_up', fields: {}, lines: [],
      subtotalCents: 1000, taxCents: 0, totalCents: 1000, stageHistory: [],
      createdAt: NOW.toISOString(), closedAt: NOW.toISOString(), version: 1
    };
    await store.commitClose('b1', order, {
      id: 'p1', orderId: 'o1', amountCents: 1000, method: 'cash', paidAt: NOW.toISOString(), paidOn: '2026-09-15'
    });
    const client = await connectTo(store, 'b1');

    const r = text(await client.callTool({ name: 'sales_report', arguments: { period: 'today' } }));
    expect(r).toContain('from 1 sale,');
    expect(r).not.toContain('1 sales');
    await client.close();
  });
});
