import { describe, expect, it } from 'vitest';
import { loadTemplate } from '../../src/profiles/load.js';
import { closeOut, moveStage, newOrder, recalcTotals } from '../../src/domain/orders.js';
import type { Order } from '../../src/domain/types.js';

const profile = loadTemplate('auto-repair');
const NOW = new Date('2026-09-15T15:00:00Z');

function orderWithLines(): Order {
  const base = newOrder({
    id: 'o1', number: 42, customerId: 'c1', assetId: 'a1', fields: {},
    stage: 'estimate', now: NOW
  });
  base.lines = [
    { itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 0 },
    { itemId: 'i2', name: 'Brake job labor', quantity: 1.5, unitPriceCents: 12000, taxable: false, backordered: 0 }
  ];
  return recalcTotals(base, 825);
}

describe('orders', () => {
  it('adds up lines and charges tax only on taxable ones', () => {
    const o = orderWithLines();
    expect(o.subtotalCents).toBe(9000 + 18000);
    expect(o.taxCents).toBe(743); // 8.25% of 9000 = 742.5 -> 743
    expect(o.totalCents).toBe(27743);
  });

  it('changes stage and keeps the history', () => {
    const r = moveStage(orderWithLines(), 'in_bay', profile, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.order.stage).toBe('in_bay');
      expect(r.order.stageHistory.at(-1)).toEqual({ stage: 'in_bay', at: NOW.toISOString() });
    }
  });

  it('does not allow moving to the closing stage', () => {
    const r = moveStage(orderWithLines(), 'picked_up', profile, NOW);
    expect(r).toEqual({ ok: false, code: 'INVALID_STAGE', reason: 'use_close_out' });
  });

  it('does not allow moving a closed order', () => {
    const closed = { ...orderWithLines(), stage: 'picked_up', closedAt: NOW.toISOString() };
    const r = moveStage(closed, 'in_bay', profile, NOW);
    expect(r).toEqual({ ok: false, code: 'INVALID_STAGE', reason: 'closed' });
  });

  it('closes from ready_for_pickup and creates the payment', () => {
    const ready = { ...orderWithLines(), stage: 'ready_for_pickup' };
    const r = closeOut(ready, 'card', profile, NOW, 'p1', '2026-09-15');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.order.stage).toBe('picked_up');
      expect(r.order.closedAt).toBe(NOW.toISOString());
      expect(r.payment).toEqual({
        id: 'p1', orderId: 'o1', amountCents: 27743, method: 'card', paidAt: NOW.toISOString(), paidOn: '2026-09-15'
      });
    }
  });

  it('does not close from a stage that is not in closeFrom', () => {
    const r = closeOut({ ...orderWithLines(), stage: 'in_bay' }, 'cash', profile, NOW, 'p1', '2026-09-15');
    expect(r).toEqual({ ok: false, code: 'CANNOT_CLOSE' });
  });
});

it('does not move a closed order', () => {
  const closed = { ...newOrder({ id: 'o', number: 1, customerId: 'c', fields: {}, stage: 'picked_up', now: new Date() }) };
  expect(moveStage(closed, 'in_bay', profile, new Date())).toEqual({ ok: false, code: 'INVALID_STAGE', reason: 'closed' });
});
