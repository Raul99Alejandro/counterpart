import { describe, expect, it } from 'vitest';
import { loadProfile } from '../../src/profiles/load.js';
import { normalize, resolveOrder, tokenScore, type OrderRef } from '../../src/domain/resolver.js';
import type { Asset, Customer, Order } from '../../src/domain/types.js';

const profile = loadProfile('auto-repair');

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

  it('puntúa por tokens compartidos con tolerancia a un error de dedo', () => {
    expect(tokenScore('civic', '2019 Honda Civic')).toBe(1);
    expect(tokenScore('camery', '2016 Toyota Camry')).toBe(1);
    expect(tokenScore('accord', '2019 Honda Civic')).toBe(0);
  });

  it('resuelve por número de orden', () => {
    const r = resolveOrder('order 44', [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: camryA });
  });

  it('resuelve por modelo del vehículo', () => {
    const r = resolveOrder('the Civic', [civic, camryA, camryB], profile);
    expect(r).toEqual({ kind: 'one', ref: civic });
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
});
