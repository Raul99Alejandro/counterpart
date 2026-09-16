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
      { id: 'p1', orderId: 'o1', amountCents: 1000, method: 'cash', paidAt: '2026-09-15T18:00:00.000Z' });
    expect(await store.listPayments('b1', '2026-09-15', '2026-09-15')).toHaveLength(1);
    expect(await store.listPayments('b1', '2026-09-16', '2026-09-20')).toHaveLength(0);
  });
});
