import { describe, expect, it } from 'vitest';
import { ConflictError, type Draft, type ProfileRecord, type Store } from '../../src/store/store.js';
import type { Business, CatalogItem, Order, Payment, PurchaseOrder } from '../../src/domain/types.js';
import { loadProfile } from '../../src/profiles/load.js';

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

const profileRecord = (): ProfileRecord => ({
  profile: loadProfile('auto-repair'), source: 'template:auto-repair', version: 1
});

const draft = (over: Partial<Draft> = {}): Draft => ({
  description: 'I run a flower shop', state: 'generating',
  createdAt: '2026-09-29T15:00:00.000Z', expiresAt: 1790000000, ...over
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

    it('aísla a cada negocio: cada lista y cada token ven solo lo suyo', async () => {
      const store = await ready();
      await store.putBusiness({ ...biz, id: 'b2', name: 'Sweet Crumb Bakery', profileId: 'bakery' });
      await store.putToken('hash-xyz', 'b2');

      // Mismo tipo de registro en los dos negocios, con ids distintos y cobros del mismo día.
      for (const b of ['b1', 'b2']) {
        await store.putCustomer(b, { id: `${b}-c`, name: 'Dana Lee', nameNormalized: 'dana lee' });
        await store.putAsset(b, { id: `${b}-a`, customerId: `${b}-c`, fields: {}, spokenLabel: '2019 Honda Civic' });
        await store.putItems(b, [{ ...item, id: `${b}-i` }]);
        await store.putOrder(b, { ...order, id: `${b}-open` });
        await store.commitClose(b, { ...order, id: `${b}-closed` }, { ...payment(`${b}-p`, '2026-09-15'), orderId: `${b}-closed` });
        await store.putPurchaseOrders(b, [{
          id: `${b}-po`, supplierId: 's1', lines: [{ itemId: `${b}-i`, qty: 5 }], status: 'open', createdAt: '2026-09-15T15:00:00.000Z'
        }]);
      }

      for (const b of ['b1', 'b2']) {
        expect((await store.listCustomers(b)).map(c => c.id)).toEqual([`${b}-c`]);
        expect((await store.listAssets(b)).map(a => a.id)).toEqual([`${b}-a`]);
        expect((await store.listItems(b)).map(i => i.id)).toEqual([`${b}-i`]);
        expect((await store.listOrders(b)).map(o => o.id).sort()).toEqual([`${b}-closed`, `${b}-open`]);
        expect((await store.listPayments(b, '2026-09-15', '2026-09-15')).map(p => p.id)).toEqual([`${b}-p`]);
        expect((await store.listOpenPurchaseOrders(b)).map(p => p.id)).toEqual([`${b}-po`]);
      }
      expect(await store.getOrder('b1', 'b2-open')).toBeNull();
      expect((await store.getBusinessByTokenHash('hash-abc'))?.id).toBe('b1');
      expect((await store.getBusinessByTokenHash('hash-xyz'))?.id).toBe('b2');
    });

    it('guarda y lee el perfil de un negocio', async () => {
      const store = await ready();
      expect(await store.getProfile('b1')).toBeNull();
      await store.putProfile('b1', profileRecord());
      expect(await store.getProfile('b1')).toEqual(profileRecord());
      expect(await store.getProfile('nadie')).toBeNull();
    });

    it('guarda, reemplaza y borra el borrador', async () => {
      const store = await ready();
      expect(await store.getDraft('b1')).toBeNull();
      await store.putDraft('b1', draft());
      const ready1 = draft({ state: 'ready', profile: loadProfile('bakery'), catalog: [item] });
      await store.putDraft('b1', ready1);
      expect(await store.getDraft('b1')).toEqual(ready1);
      await store.deleteDraft('b1');
      expect(await store.getDraft('b1')).toBeNull();
      await store.deleteDraft('b1'); // borrar lo que no existe no falla
    });

    it('activa un negocio de una vez: META, perfil, ítems y sin borrador', async () => {
      const store = await ready();
      await store.putDraft('b1', draft({ state: 'ready' }));
      const current = (await store.getBusiness('b1'))!;
      await store.activateBusiness('b1', { business: current, profile: profileRecord(), items: [item] });
      expect((await store.getBusiness('b1'))?.version).toBe(current.version + 1);
      expect(await store.getProfile('b1')).toEqual(profileRecord());
      expect((await store.listItems('b1')).map(i => [i.id, i.version])).toEqual([['i1', 2]]);
      expect(await store.getDraft('b1')).toBeNull();
    });

    it('no activa nada si la versión del negocio es vieja', async () => {
      const store = await ready();
      await store.putDraft('b1', draft({ state: 'ready' }));
      const stale = { ...(await store.getBusiness('b1'))!, version: 1 };
      await expect(store.activateBusiness('b1', { business: stale, profile: profileRecord(), items: [item] }))
        .rejects.toBeInstanceOf(ConflictError);
      expect(await store.getProfile('b1')).toBeNull();
      expect(await store.listItems('b1')).toEqual([]);
      expect(await store.getDraft('b1')).not.toBeNull();
    });
  });
}
