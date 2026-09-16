import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { ConflictError } from '../../src/store/store.js';
import { loadProfile } from '../../src/profiles/load.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import type { Business, CatalogItem, Order } from '../../src/domain/types.js';

const NOW = new Date('2026-09-15T15:00:00Z');
const business: Business = {
  id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 43, version: 1
};
const bakery: Business = {
  id: 'b2', name: 'Sweet Crumb Bakery', profileId: 'bakery',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 12, version: 1
};

let idCounter = 0;

/** Conecta un cliente MCP a un servidor con las tools del contexto dado. */
async function connect(ctx: ToolContext): Promise<Client> {
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);

  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

/** Pastelería: perfil sin activo, así que la clave de duplicados depende de los campos. */
async function bakeryFixture(): Promise<{ client: Client; store: MemoryStore }> {
  idCounter = 0;
  const store = new MemoryStore();
  await store.putBusiness(bakery);
  await store.putCustomer('b2', { id: 'bc1', name: 'Grace Kim', nameNormalized: 'grace kim' });

  const client = await connect({
    business: bakery, profile: loadProfile('bakery'), store,
    now: () => NOW, newId: p => `${p}-${++idCounter}`
  });
  return { client, store };
}

async function fixture(store: MemoryStore = new MemoryStore()): Promise<{ client: Client; store: MemoryStore }> {
  idCounter = 0;
  await store.putBusiness(business);
  await store.putCustomer('b1', { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' });
  await store.putAsset('b1', { id: 'a1', customerId: 'c1', fields: { year: 2019, make: 'Honda', model: 'Civic' }, spokenLabel: '2019 Honda Civic' });

  const order: Order = {
    id: 'o1', number: 41, customerId: 'c1', assetId: 'a1', stage: 'ready_for_pickup', fields: {},
    lines: [], subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
    createdAt: '2026-09-14T15:00:00.000Z', version: 1
  };
  await store.putOrder('b1', order);

  const pads: CatalogItem = {
    id: 'i1', name: 'Front brake pads', synonyms: ['brake pads'], kind: 'part', unit: 'each',
    priceCents: 4500, taxable: true, stocked: true, onHand: 1, reorderPoint: 2, reorderQty: 12,
    supplierId: 's1', consumes: {}, version: 1
  };
  await store.putItems('b1', [pads]);

  const client = await connect({
    business, profile: loadProfile('auto-repair'), store,
    now: () => NOW, newId: p => `${p}-${++idCounter}`
  });
  return { client, store };
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('tools de escritura', () => {
  it('abre una orden y crea cliente y vehículo nuevos', async () => {
    const { client, store } = await fixture();
    const r = await client.callTool({
      name: 'open_work_order',
      arguments: { customerName: 'Sam Reyes', asset: { year: 2020, make: 'Ford', model: 'F-150' }, description: 'brake noise' }
    });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("Sam Reyes's 2020 Ford F-150");
    expect(await store.listOrders('b1')).toHaveLength(2);
    expect((await store.listCustomers('b1')).map(c => c.name)).toContain('Sam Reyes');
  });

  it('no duplica si la misma orden se abre dos veces seguidas', async () => {
    const { client, store } = await fixture();
    const args = { customerName: 'Sam Reyes', asset: { year: 2020, make: 'Ford', model: 'F-150' } };
    await client.callTool({ name: 'open_work_order', arguments: args });
    await client.callTool({ name: 'open_work_order', arguments: args });
    expect(await store.listOrders('b1')).toHaveLength(2); // la original más una sola nueva
  });

  it('no confunde dos pedidos distintos del mismo cliente dentro de la ventana', async () => {
    const { client, store } = await bakeryFixture();
    const vanilla = { customerName: 'Grace Kim', flavor: 'vanilla', size: '8-inch', due: 'tomorrow' };
    const chocolate = { customerName: 'Grace Kim', flavor: 'chocolate', size: '10-inch', due: 'saturday' };

    const first = await client.callTool({ name: 'take_cake_order', arguments: vanilla });
    const second = await client.callTool({ name: 'take_cake_order', arguments: chocolate });
    expect(second.isError).toBeFalsy();

    const orders = await store.listOrders('b2');
    expect(orders).toHaveLength(2);
    expect(orders.map(o => o.fields.flavor).sort()).toEqual(['chocolate', 'vanilla']);
    expect((second.structuredContent as { number: number }).number)
      .not.toBe((first.structuredContent as { number: number }).number);
    expect((second.structuredContent as { dueOn: string }).dueOn).toBe('2026-09-19');

    // Repetir el primero sí se deduplica: la clave incluye campos y fecha, no los ignora.
    await client.callTool({ name: 'take_cake_order', arguments: vanilla });
    expect(await store.listOrders('b2')).toHaveLength(2);
  });

  it('agrega una partida, descuenta stock y marca backorder', async () => {
    const { client, store } = await fixture();
    const r = await client.callTool({
      name: 'add_parts_or_labor', arguments: { order: 'the Civic', item: 'brake pads', quantity: 2 }
    });
    expect(text(r)).toContain('backordered');
    const saved = (await store.listOrders('b1')).find(o => o.id === 'o1')!;
    expect(saved.lines).toHaveLength(1);
    expect(saved.totalCents).toBe(9000 + 743);
    expect((await store.listItems('b1'))[0]!.onHand).toBe(0);
  });

  it('cambia de etapa y rechaza mover a la etapa de cierre', async () => {
    const { client } = await fixture();
    const good = await client.callTool({ name: 'move_work_order_stage', arguments: { order: 'order 41', stage: 'in_bay' } });
    expect(text(good)).toContain('in the bay');

    const bad = await client.callTool({ name: 'move_work_order_stage', arguments: { order: 'order 41', stage: 'picked_up' } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('close it out');
  });

  it('cierra cobrando y es idempotente al repetir', async () => {
    const { client, store } = await fixture();
    const first = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' } });
    expect(first.isError).toBeFalsy();
    const second = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' } });
    expect(text(second)).toContain('already closed');
    expect(await store.listPayments('b1', '2026-09-01', '2026-09-30')).toHaveLength(1);
  });

  it('pide aclaración cuando la referencia no existe', async () => {
    const { client } = await fixture();
    const r = await client.callTool({ name: 'move_work_order_stage', arguments: { order: 'the Accord', stage: 'in_bay' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("I couldn't find");
  });

  it('reordena lo bajo y omite lo que ya está pedido', async () => {
    const { client, store } = await fixture();
    const first = await client.callTool({ name: 'reorder_parts', arguments: {} });
    expect(text(first)).toContain('Front brake pads');
    expect(await store.listOpenPurchaseOrders('b1')).toHaveLength(1);

    const second = await client.callTool({ name: 'reorder_parts', arguments: {} });
    expect(text(second)).toContain('already on order');
    expect(await store.listOpenPurchaseOrders('b1')).toHaveLength(1);
  });

  it('convierte un ConflictError de la store en el mensaje hablado, no en el texto interno', async () => {
    class ConflictingStore extends MemoryStore {
      override async commitOrderWithItems(): Promise<void> {
        throw new ConflictError('order o1');
      }
    }
    const { client } = await fixture(new ConflictingStore());
    const r = await client.callTool({
      name: 'add_parts_or_labor', arguments: { order: 'the Civic', item: 'brake pads', quantity: 2 }
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Please try again');
    expect(text(r)).not.toContain('conflicto');
  });
});
