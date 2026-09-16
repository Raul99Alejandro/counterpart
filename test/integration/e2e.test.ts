import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { loadProfile } from '../../src/profiles/load.js';
import { MemoryStore } from '../../src/store/memory.js';
import { registerTools, type ToolContext } from '../../src/tools/context.js';
import { seedAll } from '../../seed/run.js';

const NOW = new Date('2026-09-15T15:00:00Z'); // martes

async function connect(bizId: string): Promise<{ client: Client; store: MemoryStore }> {
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
  return { client, store };
}

const text = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

describe('flujo completo', () => {
  it('taller: abrir, cobrar partida, avanzar, cerrar y verlo en el reporte', async () => {
    const { client } = await connect('shop');

    // Línea base: la semilla ya deja pagos de "hoy", así que hay que medir el delta, no solo que sea > 0.
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

  it('pastelería: tomar pedido con fecha y encontrarlo por día', async () => {
    const { client } = await connect('bakery');

    // Línea base: la semilla ya deja pedidos para el sábado, así que hay que medir el delta.
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

  it('el resumen de la pastelería no usa vocabulario del taller', async () => {
    const { client } = await connect('bakery');
    const r = await client.callTool({ name: 'get_bakery_snapshot', arguments: {} });
    expect(text(r)).not.toContain('work order');
    await client.close();
  });
});

describe('semilla', () => {
  it('no deja armada la ventana de duplicados al arrancar', async () => {
    const { client, store } = await connect('bakery');

    const open = (await store.listOrders('bakery')).filter(o => o.stage !== 'picked_up');
    expect(open.length).toBeGreaterThan(0);
    for (const order of open) {
      expect(NOW.getTime() - new Date(order.createdAt).getTime()).toBeGreaterThan(2 * 60 * 1000);
    }

    // Un segundo pedido distinto de un cliente ya sembrado es un pedido nuevo, no un eco del anterior.
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

  it('las órdenes sembradas traen partidas, así que valen dinero y alimentan el top de ítems', async () => {
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
    // El histórico del mes ya vendido sigue contando, no solo lo que se cierre en cámara.
    expect(data.count).toBeGreaterThan(20);
    const paidThisMonth = await store.listPayments('shop', '2026-09-01', '2026-09-30');
    expect(data.totalCents).toBe(paidThisMonth.reduce((sum, p) => sum + p.amountCents, 0));

    await client.close();
  });

  it('el histórico queda cerrado: no aparece como trabajo abierto', async () => {
    for (const bizId of ['shop', 'bakery'] as const) {
      const { client, store } = await connect(bizId);
      const profileClosed = 'picked_up';
      const orders = await store.listOrders(bizId);
      const open = orders.filter(o => o.stage !== profileClosed);
      const closed = orders.filter(o => o.stage === profileClosed);

      expect(closed.length).toBeGreaterThan(20);
      for (const order of closed) expect(order.closedAt).toBeTruthy();
      // Todas las órdenes resuelven su cliente: nada se esconde por un customerId inexistente.
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
