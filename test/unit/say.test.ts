import { describe, expect, it } from 'vitest';
import { loadTemplate } from '../../src/profiles/load.js';
import { say } from '../../src/speech/say.js';
import type { OrderRef } from '../../src/domain/resolver.js';
import type { Order } from '../../src/domain/types.js';

const profile = loadTemplate('auto-repair');
const bakery = loadTemplate('bakery');

const order: Order = {
  id: 'o1', number: 42, customerId: 'c1', assetId: 'a1', stage: 'in_bay', fields: {}, lines: [],
  subtotalCents: 0, taxCents: 0, totalCents: 41250, stageHistory: [],
  createdAt: '2026-09-15T15:00:00.000Z', version: 1
};
const ref: OrderRef = {
  order,
  customer: { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' },
  asset: { id: 'a1', customerId: 'c1', fields: {}, spokenLabel: '2019 blue sedan' }
};

describe('phrases', () => {
  it('names the order with the profile noun', () => {
    expect(say.orderName(profile, 42)).toBe('work order 42');
    expect(say.orderName(bakery, 7)).toBe('cake order 7');
  });

  it('describes the order with the asset and the customer', () => {
    expect(say.orderPhrase(profile, ref)).toBe("work order 42, Dana Lee's 2019 blue sedan");
  });

  it('confirms an added line with the new total', () => {
    const line = { itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 0 };
    expect(say.lineAdded(profile, ref, line, 41250))
      .toBe('Added 2 front brake pads to work order 42. The total is now $412.50.');
  });

  it('says a single item without the number, and keeps acronyms', () => {
    const one = { itemId: 'i1', name: 'Front brake pads', quantity: 1, unitPriceCents: 4500, taxable: true, backordered: 0 };
    expect(say.lineAdded(profile, ref, one, 41250))
      .toBe('Added front brake pads to work order 42. The total is now $412.50.');
    expect(say.lineAdded(profile, ref, { ...one, name: 'ABS sensor' }, 41250))
      .toBe('Added ABS sensor to work order 42. The total is now $412.50.');
  });

  it('closes the description with a comma when the order is the subject', () => {
    expect(say.moved(profile, ref, 'in the bay')).toBe("work order 42, Dana Lee's 2019 blue sedan, is now in the bay.");
  });

  it('warns about the backorder', () => {
    const line = { itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 1 };
    expect(say.lineAdded(profile, ref, line, 41250))
      .toBe('Added 2 front brake pads to work order 42, but only 1 was in stock, so 1 is backordered. The total is now $412.50.');
  });

  it('formats the date in spoken English', () => {
    expect(say.date('2026-09-19')).toBe('Saturday, September 19');
  });

  it('opens the order with a spoken due date', () => {
    const orderWithDue: Order = { ...order, dueOn: '2026-09-19' };
    const refWithDue: OrderRef = { ...ref, order: orderWithDue };
    const result = say.opened(profile, refWithDue);
    expect(result).toContain("It's due Saturday, September 19.");
    expect(result).not.toContain('2026-09-19');
  });

  it('lists candidates when there is ambiguity', () => {
    const other: OrderRef = { ...ref, order: { ...order, id: 'o2', number: 57 },
      customer: { id: 'c2', name: 'Mark Ortiz', nameNormalized: 'mark ortiz' } };
    expect(say.ambiguous(profile, [ref, other]))
      .toBe("I found two: work order 42, Dana Lee's 2019 blue sedan and work order 57, Mark Ortiz's 2019 blue sedan. Which one?");
  });

  it('joins lists in English', () => {
    expect(say.list(['a'])).toBe('a');
    expect(say.list(['a', 'b'])).toBe('a and b');
    expect(say.list(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('uses singular or plural for stock and backorder', () => {
    const three = { itemId: 'i1', name: 'Front brake pads', quantity: 3, unitPriceCents: 4500, taxable: true, backordered: 1 };
    expect(say.lineAdded(profile, ref, three, 41250))
      .toBe('Added 3 front brake pads to work order 42, but only 2 were in stock, so 1 is backordered. The total is now $412.50.');

    const none = { ...three, quantity: 2, backordered: 2 };
    expect(say.lineAdded(profile, ref, none, 41250))
      .toBe('Added 2 front brake pads to work order 42, but none were in stock, so 2 are backordered. The total is now $412.50.');
  });

  it('speaks in singular when there is only one open order', () => {
    expect(say.notFound(profile, 'Accord', [ref]))
      .toBe(`I couldn't find an open work order for "Accord". The only open one is work order 42, Dana Lee's 2019 blue sedan.`);
  });
});
