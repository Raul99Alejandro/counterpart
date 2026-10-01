import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { MemoryStore } from '../../src/store/memory.js';
import { registerTools } from '../../src/tools/context.js';
import { toolContext } from '../helpers/context.js';
import { seedAll } from '../../seed/run.js';

const NOW = new Date('2026-09-15T15:00:00Z'); // Tuesday

async function connect(bizId: string): Promise<{ client: Client; store: MemoryStore }> {
  const store = new MemoryStore();
  await seedAll(store, NOW);
  const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
  let n = 0;
  const ctx = await toolContext(store, bizId, { now: () => NOW, newId: p => `${p}-${++n}` });
  registerTools(server, ctx);

  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'e2e', version: '1.0.0' });
  await server.server.connect(serverEnd);
  await client.connect(clientEnd);
  return { client, store };
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('full flow', () => {
  it('shop: open, charge a line item, advance, close and see it in the report', async () => {
    const { client } = await connect('shop');

    // Baseline: the seed already leaves payments for "today", so measure the delta, not just that it is > 0.
    const before = await client.callTool({ name: 'sales_report', arguments: { period: 'today' } });
    const baseline = before.structuredContent as { count: number; totalCents: number };

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
    const closedData = closed.structuredContent as { amountCents: number; alreadyClosed: boolean };
    expect(closedData.alreadyClosed).toBe(false);

    const report = await client.callTool({ name: 'sales_report', arguments: { period: 'today' } });
    const data = report.structuredContent as { count: number; totalCents: number };
    expect(data.count).toBe(baseline.count + 1);
    expect(data.totalCents).toBe(baseline.totalCents + closedData.amountCents);

    await client.close();
  });

  it('bakery: take an order with a date and find it by day', async () => {
    const { client } = await connect('bakery');

    // Baseline: the seed already leaves orders for Saturday, so measure the delta.
    const before = await client.callTool({ name: 'find_cake_orders', arguments: { due: 'saturday' } });
    const baselineTotal = (before.structuredContent as { total: number }).total;

    const taken = await client.callTool({
      name: 'take_cake_order',
      arguments: { customerName: 'Priya Shah', flavor: 'chocolate', size: '10-inch', due: 'saturday' }
    });
    expect(taken.isError).toBeFalsy();
    expect((taken.structuredContent as { dueOn: string }).dueOn).toBe('2026-09-19');

    const found = await client.callTool({ name: 'find_cake_orders', arguments: { due: 'saturday' } });
    const data = found.structuredContent as { total: number };
    expect(data.total).toBe(baselineTotal + 1);

    await client.close();
  });

  it('the bakery snapshot does not use shop vocabulary', async () => {
    const { client } = await connect('bakery');
    const r = await client.callTool({ name: 'get_bakery_snapshot', arguments: {} });
    expect(text(r)).not.toContain('work order');
    await client.close();
  });
});

describe('seed', () => {
  it('does not leave the duplicate window armed at startup', async () => {
    const { client, store } = await connect('bakery');

    const open = (await store.listOrders('bakery')).filter(o => o.stage !== 'picked_up');
    expect(open.length).toBeGreaterThan(0);
    for (const order of open) {
      expect(NOW.getTime() - new Date(order.createdAt).getTime()).toBeGreaterThan(2 * 60 * 1000);
    }

    // A second, different order from an already seeded customer is a new order, not an echo of the previous one.
    const taken = await client.callTool({
      name: 'take_cake_order',
      arguments: { customerName: 'Grace Kim', flavor: 'chocolate', size: '10-inch', due: 'saturday' }
    });
    expect(taken.isError).toBeFalsy();
    const data = taken.structuredContent as { number: number; dueOn: string };
    expect(data.dueOn).toBe('2026-09-19');
    expect(text(taken)).toContain('September 19');
    expect((await store.listOrders('bakery')).filter(o => o.stage !== 'picked_up')).toHaveLength(open.length + 1);

    await client.close();
  });

  it('seeded orders have line items, so they are worth money and feed the top items', async () => {
    const { client, store } = await connect('shop');

    const open = (await store.listOrders('shop')).filter(o => o.stage !== 'picked_up');
    expect(open.length).toBeGreaterThan(0);
    for (const order of open) {
      expect(order.lines.length).toBeGreaterThan(0);
      expect(order.totalCents).toBeGreaterThan(0);
    }

    const report = await client.callTool({ name: 'sales_report', arguments: { period: 'this_month' } });
    const data = report.structuredContent as {
      totalCents: number; count: number; topItems: Array<{ name: string; quantity: number; cents: number }>;
    };
    expect(data.topItems.length).toBeGreaterThan(0);
    expect(data.topItems[0]!.cents).toBeGreaterThan(0);
    // The month's sales history still counts, not just what gets closed on camera.
    expect(data.count).toBeGreaterThan(20);
    const paidThisMonth = await store.listPayments('shop', '2026-09-01', '2026-09-30');
    expect(data.totalCents).toBe(paidThisMonth.reduce((sum, p) => sum + p.amountCents, 0));

    await client.close();
  });

  it('the history stays closed: it does not show up as open work', async () => {
    for (const bizId of ['shop', 'bakery'] as const) {
      const { client, store } = await connect(bizId);
      const profileClosed = 'picked_up';
      const orders = await store.listOrders(bizId);
      const open = orders.filter(o => o.stage !== profileClosed);
      const closed = orders.filter(o => o.stage === profileClosed);

      expect(closed.length).toBeGreaterThan(20);
      for (const order of closed) expect(order.closedAt).toBeTruthy();
      // Every order resolves its customer: nothing is hidden by a nonexistent customerId.
      const customerIds = new Set((await store.listCustomers(bizId)).map(c => c.id));
      for (const order of orders) expect(customerIds.has(order.customerId)).toBe(true);

      const find = await client.callTool({
        name: bizId === 'shop' ? 'find_work_orders' : 'find_cake_orders', arguments: {}
      });
      expect((find.structuredContent as { total: number }).total).toBe(open.length);

      const snapshot = await client.callTool({
        name: bizId === 'shop' ? 'get_shop_snapshot' : 'get_bakery_snapshot', arguments: {}
      });
      const byStage = (snapshot.structuredContent as { byStage: Array<{ count: number }> }).byStage;
      expect(byStage.reduce((sum, s) => sum + s.count, 0)).toBe(open.length);

      await client.close();
    }
  });
});
