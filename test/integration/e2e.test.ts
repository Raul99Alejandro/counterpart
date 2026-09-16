import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { loadProfile } from '../../src/profiles/load.js';
import { MemoryStore } from '../../src/store/memory.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import { seedAll } from '../../seed/run.js';

const NOW = new Date('2026-09-15T15:00:00Z'); // martes

async function connect(bizId: string): Promise<Client> {
  const store = new MemoryStore();
  await seedAll(store, NOW);
  const business = (await store.getBusiness(bizId))!;
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  let n = 0;
  const ctx: ToolContext = {
    business, profile: loadProfile(business.profileId), store,
    now: () => NOW, newId: p => `${p}-${++n}`
  };
  registerTools(server, ctx);

  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'e2e', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('flujo completo', () => {
  it('taller: abrir, cobrar partida, avanzar, cerrar y verlo en el reporte', async () => {
    const client = await connect('shop');

    const opened = await client.callTool({
      name: 'open_work_order',
      arguments: { customerName: 'Sam Reyes', asset: { year: 2020, make: 'Ford', model: 'F-150' }, description: 'oil change' }
    });
    expect(opened.isError).toBeFalsy();

    const added = await client.callTool({
      name: 'add_parts_or_labor', arguments: { order: 'the F-150', item: 'oil change' }
    });
    expect(added.isError).toBeFalsy();

    const moved = await client.callTool({
      name: 'move_work_order_stage', arguments: { order: 'the F-150', stage: 'ready_for_pickup' }
    });
    expect(text(moved)).toContain('ready for pickup');

    const closed = await client.callTool({
      name: 'close_out_work_order', arguments: { order: 'the F-150', paymentMethod: 'card' }
    });
    expect(text(closed)).toContain('They paid');

    const report = await client.callTool({ name: 'sales_report', arguments: { period: 'today' } });
    const data = report.structuredContent as { count: number; totalCents: number };
    expect(data.count).toBeGreaterThanOrEqual(1);
    expect(data.totalCents).toBeGreaterThan(0);

    await client.close();
  });

  it('pastelería: tomar pedido con fecha y encontrarlo por día', async () => {
    const client = await connect('bakery');

    const taken = await client.callTool({
      name: 'take_cake_order',
      arguments: { customerName: 'Priya Shah', flavor: 'chocolate', size: '10-inch', due: 'saturday' }
    });
    expect(taken.isError).toBeFalsy();
    expect((taken.structuredContent as { dueOn: string }).dueOn).toBe('2026-09-19');

    const found = await client.callTool({ name: 'find_cake_orders', arguments: { due: 'saturday' } });
    const data = found.structuredContent as { total: number };
    expect(data.total).toBeGreaterThanOrEqual(1);

    await client.close();
  });

  it('el resumen de la pastelería no usa vocabulario del taller', async () => {
    const client = await connect('bakery');
    const r = await client.callTool({ name: 'get_bakery_snapshot', arguments: {} });
    expect(text(r)).not.toContain('work order');
    await client.close();
  });
});
