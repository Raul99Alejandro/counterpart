import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { captureLogs } from '../../src/log.js';
import { MemoryStore } from '../../src/store/memory.js';
import { ConflictError } from '../../src/store/store.js';
import { loadTemplate } from '../../src/profiles/load.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import type { Business, CatalogItem, Order } from '../../src/domain/types.js';

const NOW = new Date('2026-09-15T15:00:00Z');
const business: Business = {
  id: 'b1', name: 'Oak Street Auto', status: 'active', profileVersion: 1,
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 43, version: 1
};
const bakery: Business = {
  id: 'b2', name: 'Sweet Crumb Bakery', status: 'active', profileVersion: 1,
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 12, version: 1
};

let idCounter = 0;
let clock = NOW;
const tick = (ms = 5000): void => { clock = new Date(clock.getTime() + ms); };

/** Connects an MCP client to a server with the tools of the given context. */
async function connect(ctx: ToolContext): Promise<Client> {
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  registerTools(server, ctx);

  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return client;
}

/** Closing out takes two steps: the amount is read back, and the yes comes in a later turn. */
async function closeOut(client: Client, args: Record<string, unknown>, name = 'close_out_work_order') {
  await client.callTool({ name, arguments: args });
  tick();
  return client.callTool({ name, arguments: { ...args, confirm: true } });
}

/** Bakery: profile with no asset, so the duplicate key depends on the fields. */
async function bakeryFixture(): Promise<{ client: Client; store: MemoryStore }> {
  idCounter = 0;
  clock = NOW;
  const store = new MemoryStore();
  await store.putBusiness(bakery);
  await store.putCustomer('b2', { id: 'bc1', name: 'Grace Kim', nameNormalized: 'grace kim' });

  const client = await connect({
    business: bakery, profile: loadTemplate('bakery'), store,
    now: () => clock, newId: p => `${p}-${++idCounter}`
  });
  return { client, store };
}

async function fixture(store: MemoryStore = new MemoryStore()): Promise<{ client: Client; store: MemoryStore }> {
  idCounter = 0;
  clock = NOW;
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
    business, profile: loadTemplate('auto-repair'), store,
    now: () => clock, newId: p => `${p}-${++idCounter}`
  });
  return { client, store };
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('write tools', () => {
  it('opens an order and creates a new customer and vehicle', async () => {
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

  it('does not duplicate when the same order is opened twice in a row', async () => {
    const { client, store } = await fixture();
    const args = { customerName: 'Sam Reyes', asset: { year: 2020, make: 'Ford', model: 'F-150' } };
    await client.callTool({ name: 'open_work_order', arguments: args });
    await client.callTool({ name: 'open_work_order', arguments: args });
    expect(await store.listOrders('b1')).toHaveLength(2); // the original plus a single new one
  });

  it('does not mix up two different orders from the same customer within the window', async () => {
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

    // Repeating the first one is deduplicated: the key includes fields and date, it does not ignore them.
    await client.callTool({ name: 'take_cake_order', arguments: vanilla });
    expect(await store.listOrders('b2')).toHaveLength(2);
  });

  it('adds a line item, deducts stock and marks a backorder', async () => {
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

  it('changes stage and refuses to move to the closing stage', async () => {
    const { client } = await fixture();
    const good = await client.callTool({ name: 'move_work_order_stage', arguments: { order: 'order 41', stage: 'in_bay' } });
    expect(text(good)).toContain('in the bay');

    const bad = await client.callTool({ name: 'move_work_order_stage', arguments: { order: 'order 41', stage: 'picked_up' } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('close it out');
  });

  it('reads the amount back before closing, and closes after a yes in a later turn', async () => {
    const { client, store } = await fixture();
    const asked = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' } });
    expect(asked.isError).toBeFalsy();
    expect(text(asked)).toBe("Work order 41, Dana Lee's 2019 Honda Civic, comes to $0.00. Should I close it out by card?");
    expect(asked.structuredContent).toMatchObject({ status: 'needs_confirmation', amountCents: 0, method: 'card' });
    expect(await store.listPayments('b1', '2026-09-01', '2026-09-30')).toHaveLength(0);

    tick();
    const closed = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card', confirm: true } });
    expect(closed.structuredContent).toMatchObject({ status: 'closed', alreadyClosed: false });
    expect(await store.listPayments('b1', '2026-09-01', '2026-09-30')).toHaveLength(1);
  });

  it('does not take a yes that comes right after the question, in the same turn', async () => {
    const { client, store } = await fixture();
    await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' } });
    tick(1000);
    const tooSoon = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card', confirm: true } });
    expect(tooSoon.structuredContent).toMatchObject({ status: 'needs_confirmation' });
    expect(await store.listPayments('b1', '2026-09-01', '2026-09-30')).toHaveLength(0);
  });

  it('asks first when a confirmation comes without a question, or for another payment method', async () => {
    const { client, store } = await fixture();
    const unasked = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card', confirm: true } });
    expect(unasked.structuredContent).toMatchObject({ status: 'needs_confirmation' });
    tick();
    const otherMethod = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'cash', confirm: true } });
    expect(otherMethod.structuredContent).toMatchObject({ status: 'needs_confirmation', method: 'cash' });
    expect(await store.listPayments('b1', '2026-09-01', '2026-09-30')).toHaveLength(0);
  });

  it('asks again if the total changed after the question', async () => {
    const { client, store } = await fixture();
    await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' } });
    await client.callTool({ name: 'add_parts_or_labor', arguments: { order: 'the Civic', item: 'brake pads' } });
    tick();
    const stale = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card', confirm: true } });
    expect(stale.structuredContent).toMatchObject({ status: 'needs_confirmation' });
    expect(await store.listPayments('b1', '2026-09-01', '2026-09-30')).toHaveLength(0);
  });

  it('closes out with payment and is idempotent on repeat', async () => {
    const { client, store } = await fixture();
    const first = await closeOut(client, { order: 'the Civic', paymentMethod: 'card' });
    expect(first.isError).toBeFalsy();
    const second = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'card' } });
    expect(text(second)).toContain('already closed');
    expect(await store.listPayments('b1', '2026-09-01', '2026-09-30')).toHaveLength(1);
  });

  it('asks for clarification when the reference does not exist', async () => {
    const { client } = await fixture();
    const r = await client.callTool({ name: 'move_work_order_stage', arguments: { order: 'the Accord', stage: 'in_bay' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("I couldn't find");
  });

  it('reorders what is low and skips what is already on order', async () => {
    const { client, store } = await fixture();
    const first = await client.callTool({ name: 'reorder_parts', arguments: {} });
    expect(text(first)).toContain('Front brake pads');
    expect(await store.listOpenPurchaseOrders('b1')).toHaveLength(1);

    const second = await client.callTool({ name: 'reorder_parts', arguments: {} });
    expect(text(second)).toContain('already on order');
    expect(await store.listOpenPurchaseOrders('b1')).toHaveLength(1);
  });

  it('turns an unexpected exception into the INTERNAL phrase, without leaking the raw error', async () => {
    class BrokenStore extends MemoryStore {
      override async listItems(): Promise<never> {
        throw new TypeError('cannot read properties of undefined (reading x)');
      }
    }
    const cap = captureLogs();
    try {
      const { client } = await fixture(new BrokenStore());
      const r = await client.callTool({ name: 'check_parts_stock', arguments: { item: 'brake pads' } });

      expect(r.isError).toBe(true);
      expect(text(r)).toBe('Something went wrong on my end. Nothing was changed.');
      expect(text(r)).not.toContain('cannot read properties');
      expect(r.structuredContent).toBeUndefined();

      // The detail goes to the JSON log, with an identifier so it can be found.
      const internal = cap.lines().filter(l => l.msg === 'internal');
      expect(internal).toHaveLength(1);
      const logged = internal[0] as { code: string; requestId: string; error: string };
      expect(logged.code).toBe('INTERNAL');
      expect(logged.requestId).toBeTruthy();
      expect(logged.error).toContain('cannot read properties');
    } finally {
      cap.restore();
    }
  });

  it('turns a store ConflictError into the spoken message, not the internal text', async () => {
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
    expect(text(r)).not.toContain('version conflict');
  });
  it('repeating a close-out reports the payment method that was recorded', async () => {
    const { client } = await fixture();
    await closeOut(client, { order: 'the Civic', paymentMethod: 'card' });
    const again = await client.callTool({ name: 'close_out_work_order', arguments: { order: 'the Civic', paymentMethod: 'cash' } });
    expect(again.structuredContent).toMatchObject({ alreadyClosed: true, method: 'card' });
  });
});
