import type { Profile } from '../profiles/schema.js';
import { datesBetween, shiftDays } from './dates.js';
import { lowStock } from './inventory.js';
import type { OrderRef } from './resolver.js';
import type { CatalogItem, Order, Payment } from './types.js';

export interface Snapshot {
  todayRevenueCents: number;
  sameDayLastWeekCents: number;
  byStage: Array<{ stage: string; label: string; count: number }>;
  dueToday: Array<{ orderId: string; number: number; label: string }>;
  low: Array<{ itemId: string; name: string; onHand: number; reorderPoint: number }>;
}

export interface SalesReport {
  from: string; to: string; prevFrom: string; prevTo: string;
  totalCents: number; prevTotalCents: number; count: number; averageTicketCents: number;
  daily: Array<{ date: string; cents: number }>;
  prevDaily: Array<{ date: string; cents: number }>;
  topItems: Array<{ name: string; quantity: number; cents: number }>;
}

const day = (p: Payment): string => p.paidOn;

/** Speakable label for an order: the asset if there is one, otherwise the customer. */
export function refLabel(ref: OrderRef): string {
  return ref.asset?.spokenLabel ?? ref.customer.name;
}

export function buildSnapshot(input: {
  profile: Profile; refs: OrderRef[]; items: CatalogItem[]; payments: Payment[]; today: string;
}): Snapshot {
  const { profile, refs, items, payments, today } = input;
  const lastWeek = shiftDays(today, -7);
  const open = refs.filter(r => r.order.stage !== profile.closedStage);

  const byStage = profile.stages
    .filter(s => s.id !== profile.closedStage)
    .map(s => ({ stage: s.id, label: s.label, count: open.filter(r => r.order.stage === s.id).length }))
    .filter(s => s.count > 0);

  return {
    todayRevenueCents: payments.filter(p => day(p) === today).reduce((sum, p) => sum + p.amountCents, 0),
    sameDayLastWeekCents: payments.filter(p => day(p) === lastWeek).reduce((sum, p) => sum + p.amountCents, 0),
    byStage,
    dueToday: open
      .filter(r => r.order.dueOn === today)
      .map(r => ({ orderId: r.order.id, number: r.order.number, label: refLabel(r) })),
    low: lowStock(items).map(i => ({ itemId: i.id, name: i.name, onHand: i.onHand, reorderPoint: i.reorderPoint }))
  };
}

export function buildSalesReport(input: {
  range: { from: string; to: string; prevFrom: string; prevTo: string };
  payments: Payment[]; orders: Order[];
}): SalesReport {
  const { range, payments, orders } = input;
  const inRange = (p: Payment, from: string, to: string): boolean => day(p) >= from && day(p) <= to;

  const current = payments.filter(p => inRange(p, range.from, range.to));
  const previous = payments.filter(p => inRange(p, range.prevFrom, range.prevTo));
  const totalCents = current.reduce((sum, p) => sum + p.amountCents, 0);

  /** Full daily series for the range, with zeros, so the two series line up day by day. */
  const series = (from: string, to: string, list: Payment[]) => {
    const sums = new Map<string, number>();
    for (const p of list) sums.set(day(p), (sums.get(day(p)) ?? 0) + p.amountCents);
    return datesBetween(from, to).map(date => ({ date, cents: sums.get(date) ?? 0 }));
  };

  const byItem = new Map<string, { name: string; quantity: number; cents: number }>();
  const ordersById = new Map(orders.map(o => [o.id, o]));
  const paidOrderIds = new Set(current.map(p => p.orderId));
  for (const orderId of paidOrderIds) {
    for (const line of ordersById.get(orderId)?.lines ?? []) {
      const entry = byItem.get(line.itemId) ?? { name: line.name, quantity: 0, cents: 0 };
      entry.quantity += line.quantity;
      entry.cents += Math.round(line.quantity * line.unitPriceCents);
      byItem.set(line.itemId, entry);
    }
  }

  return {
    ...range,
    totalCents,
    prevTotalCents: previous.reduce((sum, p) => sum + p.amountCents, 0),
    count: current.length,
    averageTicketCents: current.length === 0 ? 0 : Math.round(totalCents / current.length),
    daily: series(range.from, range.to, current),
    prevDaily: series(range.prevFrom, range.prevTo, previous),
    topItems: [...byItem.values()].sort((a, b) => b.cents - a.cents).slice(0, 5)
  };
}
