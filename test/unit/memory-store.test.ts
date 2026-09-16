import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/store/memory.js';
import { ConflictError } from '../../src/store/store.js';
import type { Business, Order } from '../../src/domain/types.js';

const biz: Business = {
  id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};

function newStore(): MemoryStore {
  const store = new MemoryStore();
  void store.putBusiness(biz);
  void store.putToken('hash-abc', 'b1');
  return store;
}

const order: Order = {
  id: 'o1', number: 41, customerId: 'c1', stage: 'in_bay', fields: {}, lines: [],
  subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
  createdAt: '2026-09-15T15:00:00.000Z', version: 1
};

describe('MemoryStore', () => {
  it('encuentra el negocio por hash de token', async () => {
    const store = newStore();
    expect((await store.getBusinessByTokenHash('hash-abc'))?.id).toBe('b1');
    expect(await store.getBusinessByTokenHash('otro')).toBeNull();
  });

  it('entrega números de orden consecutivos', async () => {
    const store = newStore();
    expect(await store.takeOrderNumber('b1')).toBe(41);
    expect(await store.takeOrderNumber('b1')).toBe(42);
  });

  it('sube la versión al guardar y rechaza versiones viejas', async () => {
    const store = newStore();
    await store.putOrder('b1', order);
    const saved = await store.getOrder('b1', 'o1');
    expect(saved?.version).toBe(2);
    await expect(store.putOrder('b1', order)).rejects.toBeInstanceOf(ConflictError);
  });

  it('devuelve copias, no referencias', async () => {
    const store = newStore();
    await store.putOrder('b1', order);
    const first = await store.getOrder('b1', 'o1');
    first!.stage = 'mutado';
    expect((await store.getOrder('b1', 'o1'))?.stage).toBe('in_bay');
  });

  it('filtra cobros por rango de fechas inclusivo', async () => {
    const store = newStore();
    await store.commitClose('b1', { ...order, version: 1 },
      { id: 'p1', orderId: 'o1', amountCents: 1000, method: 'cash', paidAt: '2026-09-15T18:00:00.000Z', paidOn: '2026-09-15' });
    expect(await store.listPayments('b1', '2026-09-15', '2026-09-15')).toHaveLength(1);
    expect(await store.listPayments('b1', '2026-09-16', '2026-09-20')).toHaveLength(0);
  });

  it('filtra cobros por fecha civil, no por el día UTC del instante', async () => {
    const store = newStore();
    await store.commitClose('b1', { ...order, version: 1 }, {
      id: 'p9', orderId: 'o1', amountCents: 500, method: 'card',
      paidAt: '2026-09-16T01:30:00.000Z', paidOn: '2026-09-15'
    });
    expect(await store.listPayments('b1', '2026-09-15', '2026-09-15')).toHaveLength(1);
    expect(await store.listPayments('b1', '2026-09-16', '2026-09-16')).toHaveLength(0);
  });

  it('commitOrderWithItems es atómico: rechaza si hay conflicto sin escribir nada', async () => {
    const store = newStore();
    const item = { id: 'i1', name: 'Wheel', synonyms: [], kind: 'part' as const, unit: 'ea', priceCents: 5000, taxable: true, stocked: true, onHand: 10, reorderPoint: 3, reorderQty: 5, consumes: {}, version: 1 };

    // Guardar orden e item para que ambos lleguen a versión 2
    await store.putOrder('b1', order);
    await store.putItems('b1', [item]);

    const itemBefore = (await store.listItems('b1'))[0];

    // Intentar commitOrderWithItems con versión vieja de order pero versión actual de item
    await expect(
      store.commitOrderWithItems('b1', { ...order, version: 1 }, [{ ...item, version: 2 }])
    ).rejects.toBeInstanceOf(ConflictError);

    // Verificar que el item no cambió (ni versión ni onHand)
    const itemAfter = (await store.listItems('b1'))[0];
    expect(itemAfter).toEqual(itemBefore);
  });
});
