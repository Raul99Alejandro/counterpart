import { beforeEach, describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { loadProfile } from '../../src/profiles/load.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import type { Business, CatalogItem, Order } from '../../src/domain/types.js';

const NOW = new Date('2026-09-15T15:00:00Z'); // martes, 10:00 en Chicago

const business: Business = {
  id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 43, version: 1
};
const bakery: Business = {
  id: 'b2', name: 'Sweet Crumb Bakery', profileId: 'bakery',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 12, version: 1
};

async function connect(ctx: ToolContext): Promise<Client> {
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);

  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

/** Pastelería: sin activo, la etiqueta hablada es el cliente y el sabor vive en los campos. */
async function bakeryFixture(): Promise<Client> {
  const store = new MemoryStore();
  await store.putBusiness(bakery);
  await store.putCustomer('b2', { id: 'bc1', name: 'Grace Kim', nameNormalized: 'grace kim' });
  await store.putOrder('b2', {
    id: 'bo1', number: 12, customerId: 'bc1', stage: 'baking',
    fields: { flavor: 'chocolate', size: '10-inch' }, dueOn: '2026-09-19',
    lines: [], subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
    createdAt: '2026-09-14T15:00:00.000Z', version: 1
  });

  return connect({
    business: bakery, profile: loadProfile('bakery'), store, now: () => NOW, newId: p => `${p}-test`
  });
}

async function fixture(): Promise<{ client: Client; store: MemoryStore }> {
  const store = new MemoryStore();
  await store.putBusiness(business);
  await store.putCustomer('b1', { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' });
  await store.putAsset('b1', { id: 'a1', customerId: 'c1', fields: {}, spokenLabel: '2019 Honda Civic' });

  const order: Order = {
    id: 'o1', number: 41, customerId: 'c1', assetId: 'a1', stage: 'waiting_on_parts', fields: {},
    lines: [], subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
    createdAt: '2026-09-14T15:00:00.000Z', version: 1
  };
  await store.putOrder('b1', order);

  const item: CatalogItem = {
    id: 'i1', name: 'Oil filter', synonyms: ['filter'], kind: 'part', unit: 'each', priceCents: 900,
    taxable: true, stocked: true, onHand: 1, reorderPoint: 5, reorderQty: 12, supplierId: 's1',
    consumes: {}, version: 1
  };
  await store.putItems('b1', [item]);

  const client = await connect({
    business, profile: loadProfile('auto-repair'), store, now: () => NOW, newId: p => `${p}-test`
  });
  return { client, store };
}

describe('tools de lectura', () => {
  let client: Client;
  beforeEach(async () => { ({ client } = await fixture()); });

  it('registra las nueve tools con los nombres del perfil', async () => {
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual([
      'add_parts_or_labor', 'check_parts_stock', 'close_out_work_order', 'find_work_orders',
      'get_shop_snapshot', 'move_work_order_stage', 'open_work_order', 'reorder_parts', 'sales_report'
    ]);
  });

  it('el resumen del día cuenta por etapa y lista lo bajo', async () => {
    const r = await client.callTool({ name: 'get_shop_snapshot', arguments: {} });
    expect(r.isError).toBeFalsy();
    const data = r.structuredContent as { byStage: Array<{ stage: string; count: number }>; low: Array<{ name: string }> };
    expect(data.byStage).toEqual([{ stage: 'waiting_on_parts', label: 'waiting on parts', count: 1 }]);
    expect(data.low.map(l => l.name)).toEqual(['Oil filter']);
  });

  it('busca con el mismo criterio que las referencias habladas', async () => {
    // El sustantivo del perfil no debe hundir la búsqueda: es ruido, no señal.
    const withNoun = await client.callTool({ name: 'find_work_orders', arguments: { query: "Dana's work order" } });
    expect((withNoun.structuredContent as { total: number }).total).toBe(1);

    const byModel = await client.callTool({ name: 'find_work_orders', arguments: { query: 'the Civic' } });
    expect((byModel.structuredContent as { total: number }).total).toBe(1);

    const miss = await client.callTool({ name: 'find_work_orders', arguments: { query: 'the Accord' } });
    expect((miss.structuredContent as { total: number }).total).toBe(0);
  });

  it('busca por un campo de la orden en un perfil sin activo', async () => {
    const bakeryClient = await bakeryFixture();
    const r = await bakeryClient.callTool({ name: 'find_cake_orders', arguments: { query: 'chocolate' } });
    const data = r.structuredContent as { total: number; orders: Array<{ number: number }> };
    expect(data.total).toBe(1);
    expect(data.orders[0]!.number).toBe(12);
    await bakeryClient.close();
  });

  it('busca por etapa', async () => {
    const r = await client.callTool({ name: 'find_work_orders', arguments: { stage: 'waiting_on_parts' } });
    const data = r.structuredContent as { total: number; orders: Array<{ number: number }> };
    expect(data.total).toBe(1);
    expect(data.orders[0]!.number).toBe(41);
    expect((r.content[0] as { text: string }).text).toContain('work order 41');
  });

  it('consulta un ítem por sinónimo', async () => {
    const r = await client.callTool({ name: 'check_parts_stock', arguments: { item: 'filter' } });
    const data = r.structuredContent as { items: Array<{ name: string; onHand: number; low: boolean }> };
    expect(data.items).toEqual([{ itemId: 'i1', name: 'Oil filter', unit: 'each', onHand: 1, reorderPoint: 5, low: true }]);
  });

  it('avisa cuando el ítem no existe, sin romperse', async () => {
    const r = await client.callTool({ name: 'check_parts_stock', arguments: { item: 'blinker fluid' } });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toBeUndefined();
    expect((r.content[0] as { text: string }).text).toContain("I don't have");
  });

  it('reporta ventas de una semana vacía sin dividir entre cero', async () => {
    const r = await client.callTool({ name: 'sales_report', arguments: { period: 'this_week' } });
    const data = r.structuredContent as { totalCents: number; averageTicketCents: number };
    expect(data.totalCents).toBe(0);
    expect(data.averageTicketCents).toBe(0);
  });
});
