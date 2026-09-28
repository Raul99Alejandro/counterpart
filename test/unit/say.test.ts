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
  asset: { id: 'a1', customerId: 'c1', fields: {}, spokenLabel: '2019 Honda Civic' }
};

describe('frases', () => {
  it('nombra la orden con el sustantivo del perfil', () => {
    expect(say.orderName(profile, 42)).toBe('work order 42');
    expect(say.orderName(bakery, 7)).toBe('cake order 7');
  });

  it('describe la orden con el activo y el cliente', () => {
    expect(say.orderPhrase(profile, ref)).toBe("work order 42, Dana Lee's 2019 Honda Civic");
  });

  it('confirma una partida agregada con el nuevo total', () => {
    const line = { itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 0 };
    expect(say.lineAdded(profile, ref, line, 41250))
      .toBe('Added 2 Front brake pads to work order 42. The total is now $412.50.');
  });

  it('avisa del backorder', () => {
    const line = { itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 1 };
    expect(say.lineAdded(profile, ref, line, 41250))
      .toBe('Added 2 Front brake pads to work order 42, but only 1 was in stock, so 1 is backordered. The total is now $412.50.');
  });

  it('formatea la fecha en inglés hablado', () => {
    expect(say.date('2026-09-19')).toBe('Saturday, September 19');
  });

  it('abre la orden con fecha de vencimiento hablada', () => {
    const orderWithDue: Order = { ...order, dueOn: '2026-09-19' };
    const refWithDue: OrderRef = { ...ref, order: orderWithDue };
    const result = say.opened(profile, refWithDue);
    expect(result).toContain("It's due Saturday, September 19.");
    expect(result).not.toContain('2026-09-19');
  });

  it('enumera candidatas cuando hay ambigüedad', () => {
    const other: OrderRef = { ...ref, order: { ...order, id: 'o2', number: 57 },
      customer: { id: 'c2', name: 'Mark Ortiz', nameNormalized: 'mark ortiz' } };
    expect(say.ambiguous(profile, [ref, other]))
      .toBe("I found two: work order 42, Dana Lee's 2019 Honda Civic and work order 57, Mark Ortiz's 2019 Honda Civic. Which one?");
  });

  it('une listas en inglés', () => {
    expect(say.list(['a'])).toBe('a');
    expect(say.list(['a', 'b'])).toBe('a and b');
    expect(say.list(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('concuerda en número el stock y el backorder', () => {
    const three = { itemId: 'i1', name: 'Front brake pads', quantity: 3, unitPriceCents: 4500, taxable: true, backordered: 1 };
    expect(say.lineAdded(profile, ref, three, 41250))
      .toBe('Added 3 Front brake pads to work order 42, but only 2 were in stock, so 1 is backordered. The total is now $412.50.');

    const none = { ...three, quantity: 2, backordered: 2 };
    expect(say.lineAdded(profile, ref, none, 41250))
      .toBe('Added 2 Front brake pads to work order 42, but none were in stock, so 2 are backordered. The total is now $412.50.');
  });

  it('habla en singular cuando solo hay una orden abierta', () => {
    expect(say.notFound(profile, 'Accord', [ref]))
      .toBe(`I couldn't find an open work order for "Accord". The only open one is work order 42, Dana Lee's 2019 Honda Civic.`);
  });
});
