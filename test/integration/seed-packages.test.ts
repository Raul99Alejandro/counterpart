import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/store/memory.js';
import { PACKAGES_DIR, seedAll } from '../../seed/run.js';
import { checkPackage, loadPackage } from '../../seed/package.js';
import { addBusiness } from '../../seed/business.js';

const NOW = new Date('2026-09-15T15:00:00Z'); // Tuesday

/** Fingerprint of the seeded data: if a price, a stock level, a line item or a payment changes, the fingerprint changes. */
async function fingerprint(store: MemoryStore, bizId: string) {
  const orders = await store.listOrders(bizId);
  const payments = await store.listPayments(bizId, '0000-01-01', '9999-12-31');
  return {
    business: await store.getBusiness(bizId),
    orders: orders.length,
    orderCents: orders.reduce((sum, o) => sum + o.totalCents, 0),
    open: orders.filter(o => !o.id.includes('-hist-'))
      .map(o => `${o.id}:${o.number}:${o.stage}:${o.dueOn ?? '-'}:${o.createdAt}:${JSON.stringify(o.fields)}:${o.lines.map(l => l.itemId).join('+')}:${o.totalCents}`)
      .sort(),
    payments: payments.length,
    paymentCents: payments.reduce((sum, p) => sum + p.amountCents, 0),
    items: (await store.listItems(bizId))
      .map(i => `${i.id}:${i.name}:${i.kind}:${i.unit}:${i.priceCents}:${i.taxable}:${i.stocked}:${i.onHand}:${i.reorderPoint}:${i.reorderQty}:${i.supplierId ?? '-'}:${JSON.stringify(i.consumes)}:${i.synonyms.join('|')}`)
      .sort(),
    customers: (await store.listCustomers(bizId)).map(c => `${c.id}:${c.name}`).sort(),
    assets: (await store.listAssets(bizId)).map(a => `${a.id}:${a.customerId}:${a.spokenLabel}:${JSON.stringify(a.fields)}`).sort()
  };
}

describe('demo seed', () => {
  it('seeds exactly the same as before the move to packages', async () => {
    const store = new MemoryStore();
    await seedAll(store, NOW);
    expect(await fingerprint(store, 'shop')).toMatchSnapshot();
    expect(await fingerprint(store, 'bakery')).toMatchSnapshot();
  });
});

describe('demo packages', () => {
  for (const id of ['shop', 'bakery']) {
    it(`${id} passes business:check`, () => {
      expect(checkPackage(path.join(PACKAGES_DIR, id))).toMatchObject({ ok: true });
    });
  }

  it('addBusiness seeds a package and refuses to seed it twice', async () => {
    const store = new MemoryStore();
    const pkg = loadPackage(path.join(PACKAGES_DIR, 'bakery'));
    await addBusiness(store, pkg, NOW);
    expect((await store.getBusiness('bakery'))?.status).toBe('active');
    await expect(addBusiness(store, pkg, NOW)).rejects.toThrow(/Business "bakery" already exists/);
  });
});
