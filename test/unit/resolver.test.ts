import { describe, expect, it } from 'vitest';
import { loadTemplate } from '../../src/profiles/load.js';
import { normalize, pickBest, resolveOrder, tokenScore, type OrderRef } from '../../src/domain/resolver.js';
import type { Asset, Customer, Order } from '../../src/domain/types.js';

const profile = loadTemplate('auto-repair');

function ref(number: number, customerName: string, spokenLabel: string, plate?: string): OrderRef {
  const order: Order = {
    id: `o${number}`, number, customerId: `c${number}`, assetId: `a${number}`, stage: 'in_bay', fields: {},
    lines: [], subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
    createdAt: '2026-09-15T15:00:00.000Z', version: 1
  };
  const customer: Customer = { id: `c${number}`, name: customerName, nameNormalized: customerName.toLowerCase() };
  const asset: Asset = { id: `a${number}`, customerId: `c${number}`, fields: plate ? { plate } : {}, spokenLabel };
  return { order, customer, asset };
}

const civic = ref(41, 'Dana Lee', '2019 Honda Civic', 'JHK 4821');
const camryA = ref(44, 'Mark Ortiz', '2016 Toyota Camry');
const camryB = ref(57, 'Priya Shah', '2018 Toyota Camry');

describe('spoken references', () => {
  it('removes stop words and the profile nouns', () => {
    expect(normalize("Mrs. Johnson's work order", ['work', 'order'])).toEqual(['johnson']);
  });

  it('treats the curly possessive apostrophe the same as the straight one', () => {
    expect(normalize('Dana’s Civic')).toEqual(normalize("Dana's Civic"));
    expect(normalize('Dana’s Civic')).toEqual(['dana', 'civic']);
  });

  it('scores by shared tokens, tolerating one typo', () => {
    expect(tokenScore('civic', '2019 Honda Civic')).toBe(1);
    expect(tokenScore('camery', '2016 Toyota Camry')).toBe(1);
    expect(tokenScore('accord', '2019 Honda Civic')).toBe(0);
  });

  it('treats a word and its plural as the same', () => {
    expect(tokenScore('boxes', '8-inch cake box')).toBe(1);
    expect(tokenScore('box', 'cake boxes')).toBe(1);
    expect(tokenScore('pad', 'Front brake pads')).toBe(1);
    expect(tokenScore('bus', 'boxes')).toBe(0);
  });

  it('resolves by order number', () => {
    const r = resolveOrder('order 44', [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: camryA });
  });

  it('a number inside a model does not take the order number shortcut ("CX-5" is not order 5)', () => {
    const orderFive = ref(5, 'Sam Reyes', '2020 Ford F-150');
    const cx5 = ref(47, 'Nina Patel', '2020 Mazda CX-5');
    expect(resolveOrder('the CX-5', [orderFive, cx5], profile)).toEqual({ kind: 'one', ref: cx5 });
    const order150 = ref(150, 'Tom Becker', '2017 Chevrolet Malibu');
    expect(resolveOrder('the F-150', [order150, orderFive], profile)).toEqual({ kind: 'one', ref: orderFive });
  });

  it('with more words than the number, uses the number if the text does not resolve', () => {
    expect(resolveOrder('the one 44', [civic, camryA, camryB], profile)).toEqual({ kind: 'one', ref: camryA });
  });

  it('resolves by vehicle model', () => {
    const r = resolveOrder('the Civic', [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: civic });
  });

  it('matches hyphenated models the way Alexa transcribes them ("CX 5" for "CX-5")', () => {
    const cx5 = ref(47, 'Nina Patel', '2020 Mazda CX-5');
    const found = resolveOrder('the CX 5', [civic, cx5], profile);
    expect(found.kind === 'one' && found.ref.order.number).toBe(47);
    const written = resolveOrder('the CX-5', [civic, cx5], profile);
    expect(written.kind === 'one' && written.ref.order.number).toBe(47);
  });

  it('matches models written as one word ("CX5" for "CX-5"), the way the agent passes them', () => {
    const cx5 = ref(47, 'Nina Patel', '2020 Mazda CX-5');
    const found = resolveOrder('the CX5', [civic, cx5], profile);
    expect(found.kind === 'one' && found.ref.order.number).toBe(47);
  });

  it('resolves by possessive customer name', () => {
    const r = resolveOrder("Dana's", [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: civic });
  });

  it('flags ambiguity when two are equally good', () => {
    const r = resolveOrder('the Camry', [civic, camryA, camryB], profile);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.refs.map(x => x.order.number).sort()).toEqual([44, 57]);
  });

  it('does not make one up when nothing matches', () => {
    expect(resolveOrder('the Accord', [civic, camryA, camryB], profile)).toEqual({ kind: 'none' });
    expect(resolveOrder('the', [civic], profile)).toEqual({ kind: 'none' });
  });

  it('searches any asset field, not just the plate', () => {
    const truck: OrderRef = {
      ...ref(90, 'Kim Park', 'Box Truck'),
      asset: { id: 'a90', customerId: 'c90', fields: { vin: 'ZX9' }, spokenLabel: 'Box Truck' }
    };
    expect(resolveOrder('ZX9', [civic, truck], profile)).toEqual({ kind: 'one', ref: truck });
  });
});

describe('pickBest', () => {
  it('picks the best, ties within the margin and drops what misses the threshold', () => {
    expect(pickBest([{ value: 'a', score: 1 }, { value: 'b', score: 0.5 }])).toEqual({ kind: 'one', value: 'a' });
    expect(pickBest([{ value: 'a', score: 0.9 }, { value: 'b', score: 0.8 }])).toEqual({ kind: 'ambiguous', values: ['a', 'b'] });
    expect(pickBest([{ value: 'a', score: 0.4 }])).toEqual({ kind: 'none' });
    expect(pickBest([])).toEqual({ kind: 'none' });
  });
});
