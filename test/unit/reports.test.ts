import { describe, expect, it } from 'vitest';
import { loadTemplate } from '../../src/profiles/load.js';
import { buildSalesReport, buildSnapshot } from '../../src/domain/reports.js';
import type { CatalogItem, Order, Payment } from '../../src/domain/types.js';
import type { OrderRef } from '../../src/domain/resolver.js';

const profile = loadTemplate('auto-repair');

function order(over: Partial<Order> & { id: string; number: number }): Order {
  return {
    customerId: 'c1', stage: 'in_bay', fields: {}, lines: [], subtotalCents: 0, taxCents: 0,
    totalCents: 0, stageHistory: [], createdAt: '2026-09-15T15:00:00.000Z', version: 1, ...over
  };
}
function ref(o: Order): OrderRef {
  return { order: o, customer: { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' },
           asset: { id: 'a1', customerId: 'c1', fields: {}, spokenLabel: '2019 Honda Civic' } };
}
function pay(id: string, orderId: string, cents: number, date: string): Payment {
  return { id, orderId, amountCents: cents, method: 'card', paidAt: `${date}T18:00:00.000Z`, paidOn: date };
}
const item: CatalogItem = {
  id: 'i1', name: 'Oil filter', synonyms: [], kind: 'part', unit: 'each', priceCents: 900,
  taxable: true, stocked: true, onHand: 1, reorderPoint: 5, reorderQty: 12, consumes: {}, version: 1
};

describe('reports', () => {
  it('builds the daily snapshot', () => {
    const a = order({ id: 'o1', number: 41, stage: 'in_bay', dueOn: '2026-09-15' });
    const b = order({ id: 'o2', number: 42, stage: 'waiting_on_parts' });
    const s = buildSnapshot({
      profile, refs: [ref(a), ref(b)], items: [item], today: '2026-09-15',
      payments: [pay('p1', 'o3', 12000, '2026-09-15'), pay('p2', 'o4', 9000, '2026-09-08')]
    });
    expect(s.todayRevenueCents).toBe(12000);
    expect(s.sameDayLastWeekCents).toBe(9000);
    expect(s.byStage).toEqual([
      { stage: 'in_bay', label: 'in the bay', count: 1 },
      { stage: 'waiting_on_parts', label: 'waiting on parts', count: 1 }
    ]);
    expect(s.dueToday).toEqual([{ orderId: 'o1', number: 41, label: '2019 Honda Civic' }]);
    expect(s.low).toEqual([{ itemId: 'i1', name: 'Oil filter', onHand: 1, reorderPoint: 5 }]);
  });

  it('builds the sales report with comparison and top items', () => {
    const paid = order({
      id: 'o1', number: 41,
      lines: [{ itemId: 'i1', name: 'Oil filter', quantity: 2, unitPriceCents: 900, taxable: true, backordered: 0 }]
    });
    const r = buildSalesReport({
      range: { from: '2026-09-14', to: '2026-09-20', prevFrom: '2026-09-07', prevTo: '2026-09-13' },
      payments: [pay('p1', 'o1', 10000, '2026-09-15'), pay('p2', 'o1', 5000, '2026-09-16'), pay('p3', 'o1', 8000, '2026-09-09')],
      orders: [paid]
    });
    expect(r.totalCents).toBe(15000);
    expect(r.prevTotalCents).toBe(8000);
    expect(r.count).toBe(2);
    expect(r.averageTicketCents).toBe(7500);
    // Full series for the range, with zeros (spec B2 §5.5.5).
    expect(r.daily.filter(d => d.cents > 0)).toEqual([{ date: '2026-09-15', cents: 10000 }, { date: '2026-09-16', cents: 5000 }]);
    expect(r.daily).toHaveLength(7);
    // Two payments for the same order must not double its lines in the item totals.
    expect(r.topItems).toEqual([{ name: 'Oil filter', quantity: 2, cents: 1800 }]);
  });
});

it('the report includes every day of the range and the previous period series aligned', () => {
  const pay = (id: string, paidOn: string, amountCents: number): Payment =>
    ({ id, orderId: id, amountCents, method: 'cash', paidAt: `${paidOn}T18:00:00.000Z`, paidOn });
  const report = buildSalesReport({
    range: { from: '2026-09-14', to: '2026-09-16', prevFrom: '2026-09-07', prevTo: '2026-09-09' },
    payments: [pay('a', '2026-09-15', 1000), pay('b', '2026-09-07', 500)], orders: []
  });
  expect(report.daily).toEqual([
    { date: '2026-09-14', cents: 0 }, { date: '2026-09-15', cents: 1000 }, { date: '2026-09-16', cents: 0 }
  ]);
  expect(report.prevDaily).toEqual([
    { date: '2026-09-07', cents: 500 }, { date: '2026-09-08', cents: 0 }, { date: '2026-09-09', cents: 0 }
  ]);
});
