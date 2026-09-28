import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { loadTemplate } from '../../src/profiles/load.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import type { Business, Order } from '../../src/domain/types.js';

// 20:30 del 15 de septiembre en Chicago = 01:30 del 16 en UTC.
const EVENING = new Date('2026-09-16T01:30:00Z');

const business: Business = {
  id: 'b1', name: 'Oak Street Auto', status: 'active', profileVersion: 1,
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 43, version: 1
};

async function connect(): Promise<Client> {
  const store = new MemoryStore();
  await store.putBusiness(business);
  await store.putCustomer('b1', { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' });
  await store.putAsset('b1', {
    id: 'a1', customerId: 'c1',
    fields: { year: 2019, make: 'Honda', model: 'Civic' }, spokenLabel: '2019 Honda Civic'
  });
  const order: Order = {
    id: 'o1', number: 41, customerId: 'c1', assetId: 'a1', stage: 'ready_for_pickup', fields: {},
    lines: [{ itemId: 'i1', name: 'Oil change', quantity: 1, unitPriceCents: 6000, taxable: false, backordered: 0 }],
    subtotalCents: 6000, taxCents: 0, totalCents: 6000, stageHistory: [],
    createdAt: '2026-09-14T15:00:00.000Z', version: 1
  };
  await store.putOrder('b1', order);

  let n = 0;
  const ctx: ToolContext = {
    business, profile: loadTemplate('auto-repair'), store,
    now: () => EVENING, newId: p => `${p}-${++n}`
  };
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('fecha civil del cobro', () => {
  it('un cobro de noche cuenta en el día del negocio, no en el de UTC', async () => {
    const client = await connect();
    const closed = await client.callTool({
      name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' }
    });
    expect(closed.isError).toBeFalsy();

    const report = await client.callTool({ name: 'sales_report', arguments: { period: 'today' } });
    const data = report.structuredContent as { from: string; count: number; totalCents: number };
    expect(data.from).toBe('2026-09-15');
    expect(data.count).toBe(1);
    expect(data.totalCents).toBe(6000);
    await client.close();
  });

  it('repetir el cierre de noche sigue siendo idempotente', async () => {
    const client = await connect();
    await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' } });
    const again = await client.callTool({
      name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' }
    });
    expect(text(again)).toContain('already closed');

    const report = await client.callTool({ name: 'sales_report', arguments: { period: 'today' } });
    expect((report.structuredContent as { count: number }).count).toBe(1);
    await client.close();
  });
});

describe('rango de la semana del resumen', () => {
  it('incluye el mismo día de la semana pasada aunque en medio termine el horario de verano', async () => {
    // Sábado 7 de noviembre, 23:30 en Chicago (CST). Restar 7×24 h cae el 1 de noviembre a las
    // 00:30 CDT: el rango empezaría el 1 y dejaría fuera el sábado 31 de octubre.
    const lateSaturday = new Date('2026-11-08T05:30:00Z');
    const store = new MemoryStore();
    await store.putBusiness(business);
    const sold: Order = {
      id: 'o9', number: 9, customerId: 'c1', stage: 'picked_up', fields: {},
      lines: [], subtotalCents: 4200, taxCents: 0, totalCents: 4200, stageHistory: [],
      createdAt: '2026-10-31T15:00:00.000Z', closedAt: '2026-10-31T15:00:00.000Z', version: 1
    };
    await store.commitClose('b1', sold, {
      id: 'p9', orderId: 'o9', amountCents: 4200, method: 'cash',
      paidAt: '2026-10-31T15:00:00.000Z', paidOn: '2026-10-31'
    });

    const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
    registerTools(server, {
      business, profile: loadTemplate('auto-repair'), store, now: () => lateSaturday, newId: p => `${p}-1`
    });
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await server.server.connect(serverEnd);
    await client.connect(clientEnd);

    const r = await client.callTool({ name: 'get_shop_snapshot', arguments: {} });
    expect(r.isError).toBeFalsy();
    expect((r.structuredContent as { sameDayLastWeekCents: number }).sameDayLastWeekCents).toBe(4200);
    await client.close();
  });
});
