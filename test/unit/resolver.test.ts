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

describe('referencias habladas', () => {
  it('quita palabras vacías y los sustantivos del perfil', () => {
    expect(normalize("Mrs. Johnson's work order", ['work', 'order'])).toEqual(['johnson']);
  });

  it('trata el apóstrofo tipográfico del posesivo igual que el recto', () => {
    expect(normalize('Dana’s Civic')).toEqual(normalize("Dana's Civic"));
    expect(normalize('Dana’s Civic')).toEqual(['dana', 'civic']);
  });

  it('puntúa por tokens compartidos con tolerancia a un error de dedo', () => {
    expect(tokenScore('civic', '2019 Honda Civic')).toBe(1);
    expect(tokenScore('camery', '2016 Toyota Camry')).toBe(1);
    expect(tokenScore('accord', '2019 Honda Civic')).toBe(0);
  });

  it('trata una palabra y su plural como la misma', () => {
    expect(tokenScore('boxes', '8-inch cake box')).toBe(1);
    expect(tokenScore('box', 'cake boxes')).toBe(1);
    expect(tokenScore('pad', 'Front brake pads')).toBe(1);
    expect(tokenScore('bus', 'boxes')).toBe(0);
  });

  it('resuelve por número de orden', () => {
    const r = resolveOrder('order 44', [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: camryA });
  });

  it('un número dentro de un modelo no toma el atajo por número de orden ("CX-5" no es la orden 5)', () => {
    const orderFive = ref(5, 'Sam Reyes', '2020 Ford F-150');
    const cx5 = ref(47, 'Nina Patel', '2020 Mazda CX-5');
    expect(resolveOrder('the CX-5', [orderFive, cx5], profile)).toEqual({ kind: 'one', ref: cx5 });
    const order150 = ref(150, 'Tom Becker', '2017 Chevrolet Malibu');
    expect(resolveOrder('the F-150', [order150, orderFive], profile)).toEqual({ kind: 'one', ref: orderFive });
  });

  it('con más palabras que el número, usa el número si el texto no resuelve', () => {
    expect(resolveOrder('the one 44', [civic, camryA, camryB], profile)).toEqual({ kind: 'one', ref: camryA });
  });

  it('resuelve por modelo del vehículo', () => {
    const r = resolveOrder('the Civic', [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: civic });
  });

  it('empata modelos con guion como los transcribe Alexa ("CX 5" por "CX-5")', () => {
    const cx5 = ref(47, 'Nina Patel', '2020 Mazda CX-5');
    const found = resolveOrder('the CX 5', [civic, cx5], profile);
    expect(found.kind === 'one' && found.ref.order.number).toBe(47);
    const written = resolveOrder('the CX-5', [civic, cx5], profile);
    expect(written.kind === 'one' && written.ref.order.number).toBe(47);
  });

  it('resuelve por nombre del cliente en posesivo', () => {
    const r = resolveOrder("Dana's", [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: civic });
  });

  it('marca ambigüedad cuando hay dos igual de buenas', () => {
    const r = resolveOrder('the Camry', [civic, camryA, camryB], profile);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.refs.map(x => x.order.number).sort()).toEqual([44, 57]);
  });

  it('no inventa cuando no hay coincidencia', () => {
    expect(resolveOrder('the Accord', [civic, camryA, camryB], profile)).toEqual({ kind: 'none' });
    expect(resolveOrder('the', [civic], profile)).toEqual({ kind: 'none' });
  });

  it('busca en cualquier campo del activo, no solo en la placa', () => {
    const truck: OrderRef = {
      ...ref(90, 'Kim Park', 'Box Truck'),
      asset: { id: 'a90', customerId: 'c90', fields: { vin: 'ZX9' }, spokenLabel: 'Box Truck' }
    };
    expect(resolveOrder('ZX9', [civic, truck], profile)).toEqual({ kind: 'one', ref: truck });
  });
});

describe('pickBest', () => {
  it('elige el mejor, empata dentro del margen y descarta lo que no llega al umbral', () => {
    expect(pickBest([{ value: 'a', score: 1 }, { value: 'b', score: 0.5 }])).toEqual({ kind: 'one', value: 'a' });
    expect(pickBest([{ value: 'a', score: 0.9 }, { value: 'b', score: 0.8 }])).toEqual({ kind: 'ambiguous', values: ['a', 'b'] });
    expect(pickBest([{ value: 'a', score: 0.4 }])).toEqual({ kind: 'none' });
    expect(pickBest([])).toEqual({ kind: 'none' });
  });
});
