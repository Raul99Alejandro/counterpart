import type { Profile } from '../profiles/schema.js';
import { taxOn } from './money.js';
import type { Order, Payment } from './types.js';

/** Recalcula subtotal, impuesto y total desde las partidas. */
export function recalcTotals(order: Order, taxRateBps: number): Order {
  let subtotal = 0;
  let taxable = 0;
  for (const line of order.lines) {
    const amount = Math.round(line.quantity * line.unitPriceCents);
    subtotal += amount;
    if (line.taxable) taxable += amount;
  }
  const taxCents = taxOn(taxable, taxRateBps);
  return { ...order, subtotalCents: subtotal, taxCents, totalCents: subtotal + taxCents };
}

export function newOrder(input: {
  id: string; number: number; customerId: string; assetId?: string;
  fields: Record<string, string>; dueOn?: string; description?: string; stage: string; now: Date;
}): Order {
  return {
    id: input.id, number: input.number, customerId: input.customerId, assetId: input.assetId,
    stage: input.stage, fields: input.fields, dueOn: input.dueOn, description: input.description,
    lines: [], subtotalCents: 0, taxCents: 0, totalCents: 0,
    stageHistory: [{ stage: input.stage, at: input.now.toISOString() }],
    createdAt: input.now.toISOString(), version: 1
  };
}

export function isClosed(order: Order, profile: Profile): boolean {
  return order.stage === profile.closedStage;
}

export function moveStage(order: Order, stage: string, profile: Profile, now: Date):
  | { ok: true; order: Order }
  | { ok: false; code: 'INVALID_STAGE'; reason: 'closed' | 'use_close_out' | 'unknown_stage' } {
  if (isClosed(order, profile)) return { ok: false, code: 'INVALID_STAGE', reason: 'closed' };
  if (stage === profile.closedStage) return { ok: false, code: 'INVALID_STAGE', reason: 'use_close_out' };
  if (!profile.stages.some(s => s.id === stage)) {
    return { ok: false, code: 'INVALID_STAGE', reason: 'unknown_stage' };
  }
  if (order.stage === stage) return { ok: true, order }; // idempotente
  return {
    ok: true,
    order: { ...order, stage, stageHistory: [...order.stageHistory, { stage, at: now.toISOString() }] }
  };
}

export function closeOut(
  order: Order, method: Payment['method'], profile: Profile, now: Date, paymentId: string
): { ok: true; order: Order; payment: Payment } | { ok: false; code: 'CANNOT_CLOSE' } {
  if (!profile.closeFrom.includes(order.stage)) return { ok: false, code: 'CANNOT_CLOSE' };
  const at = now.toISOString();
  return {
    ok: true,
    order: {
      ...order, stage: profile.closedStage, closedAt: at,
      stageHistory: [...order.stageHistory, { stage: profile.closedStage, at }]
    },
    payment: { id: paymentId, orderId: order.id, amountCents: order.totalCents, method, paidAt: at }
  };
}
