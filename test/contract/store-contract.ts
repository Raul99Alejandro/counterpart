import { describe, expect, it } from 'vitest';
import { ConflictError, type Store } from '../../src/store/store.js';
import type { Business, CatalogItem, Order, Payment, PurchaseOrder } from '../../src/domain/types.js';

const biz: Business = {
  id: 'b1', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};

const order: Order = {
  id: 'o1', number: 41, customerId: 'c1', stage: 'in_bay', fields: {}, lines: [],
  subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [],
  createdAt: '2026-09-15T15:00:00.000Z', version: 1
};

const item: CatalogItem = {
  id: 'i1', name: 'Wheel', synonyms: [], kind: 'part', unit: 'ea', priceCents: 5000,
  taxable: true, stocked: true, onHand: 10, reorderPoint: 3, reorderQty: 5, consumes: {}, version: 1
};

const payment = (id: string, paidOn: string, paidAt = `${paidOn}T18:00:00.000Z`): Payment => ({
  id, orderId: 'o1', amountCents: 1000, method: 'cash', paidAt, paidOn
});

/** Lo que cualquier implementación de Store tiene que cumplir. La corren MemoryStore y DynamoStore. */
export function runStoreContract(name: string, makeStore: () => Promise<Store>): void {
  describe(`contrato de Store: ${name}`, () => {
    async function ready(): Promise<Store> {
      const store = await makeStore();
      await store.putBusiness(biz);
      await store.putToken('hash-abc', 'b1');
      return store;
    }

    it('encuentra el negocio por hash de token', async () => {
      const store = await ready();
      expect((await store.getBusinessByTokenHash('hash-abc'))?.id).toBe('b1');
      expect(await store.getBusinessByTokenHash('otro')).toBeNull();
    });

    it('devuelve null para un negocio que no existe', async () => {
      const store = await ready();
      expect(await store.getBusiness('nadie')).toBeNull();
    });

    it('sube la versión del negocio al crearlo, igual que las demás entidades', async () => {
      const store = await ready();
      expect((await store.getBusiness('b1'))?.version).toBe(2);
    });

    it('rechaza una versión vieja del negocio y acepta la vigente', async () => {
      const store = await ready();
      await expect(store.putBusiness({ ...biz, version: 1 })).rejects.toBeInstanceOf(ConflictError);
      await store.putBusiness({ ...biz, version: 2 });
      expect((await store.getBusiness('b1'))?.version).toBe(3);
    });

    it('entrega números de orden consecutivos', async () => {
      const store = await ready();
      expect(await store.takeOrderNumber('b1')).toBe(41);
      expect(await store.takeOrderNumber('b1')).toBe(42);
    });

    it('no entrega números de orden para un negocio desconocido', async () => {
      const store = await ready();
      await expect(store.takeOrderNumber('nadie')).rejects.toThrow();
    });

    it('sube la versión al guardar y rechaza versiones viejas', async () => {
      const store = await ready();
      await store.putOrder('b1', order);
      expect((await store.getOrder('b1', 'o1'))?.version).toBe(2);
      await expect(store.putOrder('b1', order)).rejects.toBeInstanceOf(ConflictError);
    });

    it('devuelve copias, no referencias', async () => {
      const store = await ready();
      await store.putOrder('b1', order);
      const first = await store.getOrder('b1', 'o1');
      first!.stage = 'mutado';
      expect((await store.getOrder('b1', 'o1'))?.stage).toBe('in_bay');
    });

    it('guarda y lista clientes y activos', async () => {
      const store = await ready();
      await store.putCustomer('b1', { id: 'c1', name: 'Dana Lee', nameNormalized: 'dana lee' });
      await store.putAsset('b1', { id: 'a1', customerId: 'c1', fields: { year: 2019 }, spokenLabel: '2019 Honda Civic' });
      expect((await store.listCustomers('b1')).map(c => c.name)).toEqual(['Dana Lee']);
      expect((await store.listAssets('b1'))[0]).toEqual({
        id: 'a1', customerId: 'c1', fields: { year: 2019 }, spokenLabel: '2019 Honda Civic'
      });
    });

    it('filtra cobros por rango de fechas inclusivo', async () => {
      const store = await ready();
      await store.commitClose('b1', { ...order, version: 1 }, payment('p1', '2026-09-15'));
      expect(await store.listPayments('b1', '2026-09-15', '2026-09-15')).toHaveLength(1);
      expect(await store.listPayments('b1', '2026-09-16', '2026-09-20')).toHaveLength(0);
    });

    it('filtra cobros por fecha civil, no por el día UTC del instante', async () => {
      const store = await ready();
      await store.commitClose('b1', { ...order, version: 1 }, payment('p9', '2026-09-15', '2026-09-16T01:30:00.000Z'));
      expect(await store.listPayments('b1', '2026-09-15', '2026-09-15')).toHaveLength(1);
      expect(await store.listPayments('b1', '2026-09-16', '2026-09-16')).toHaveLength(0);
    });

    it('commitClose con versión vieja no registra el cobro', async () => {
      const store = await ready();
      await store.putOrder('b1', order);
      await expect(store.commitClose('b1', { ...order, version: 1 }, payment('p2', '2026-09-15')))
        .rejects.toBeInstanceOf(ConflictError);
      expect(await store.listPayments('b1', '2026-09-01', '2026-09-30')).toHaveLength(0);
    });

    it('commitOrderWithItems es atómico: rechaza si hay conflicto sin escribir nada', async () => {
      const store = await ready();
      await store.putOrder('b1', order);
      await store.putItems('b1', [item]);
      const itemBefore = (await store.listItems('b1'))[0];

      await expect(
        store.commitOrderWithItems('b1', { ...order, version: 1 }, [{ ...item, version: 2 }])
      ).rejects.toBeInstanceOf(ConflictError);

      expect((await store.listItems('b1'))[0]).toEqual(itemBefore);
    });

    it('putItems es todo o nada', async () => {
      const store = await ready();
      await store.putItems('b1', [item]);
      const fresh: CatalogItem = { ...item, id: 'i2', name: 'Tire' };
      await expect(store.putItems('b1', [fresh, { ...item, version: 1 }])).rejects.toBeInstanceOf(ConflictError);
      expect((await store.listItems('b1')).map(i => i.id)).toEqual(['i1']);
    });

    it('lista solo las órdenes de compra abiertas', async () => {
      const store = await ready();
      const po = (id: string, status: PurchaseOrder['status']): PurchaseOrder => ({
        id, supplierId: 's1', lines: [{ itemId: 'i1', qty: 5 }], status, createdAt: '2026-09-15T15:00:00.000Z'
      });
      await store.putPurchaseOrders('b1', [po('po1', 'open'), po('po2', 'received')]);
      expect((await store.listOpenPurchaseOrders('b1')).map(p => p.id)).toEqual(['po1']);
    });
  });
}
