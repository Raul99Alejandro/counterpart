import { hashToken } from '../src/http/auth.js';
import { loadProfile } from '../src/profiles/load.js';
import { spokenLabel } from '../src/domain/assets.js';
import { newOrder, recalcTotals } from '../src/domain/orders.js';
import type { Business, Order, Payment } from '../src/domain/types.js';
import type { Store } from '../src/store/store.js';
import { BAKERY_ITEMS, SHOP_ITEMS, mulberry32 } from './data.js';

export const DEMO_TOKENS = { shop: 'demo-shop-token', bakery: 'demo-bakery-token' };

const SHOP: Business = {
  id: 'shop', name: 'Oak Street Auto', profileId: 'auto-repair',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 41, version: 1
};
const BAKERY: Business = {
  id: 'bakery', name: 'Sweet Crumb Bakery', profileId: 'bakery',
  timezone: 'America/Chicago', taxRateBps: 825, nextOrderNumber: 12, version: 1
};

const VEHICLES: Array<[string, Record<string, string | number>, string]> = [
  ['Dana Lee', { year: 2019, make: 'Honda', model: 'Civic', plate: 'JHK 4821' }, 'estimate'],
  ['Mark Ortiz', { year: 2016, make: 'Toyota', model: 'Camry' }, 'approved'],
  ['Priya Shah', { year: 2018, make: 'Toyota', model: 'Camry' }, 'in_bay'],
  ['Alex Nowak', { year: 2015, make: 'Subaru', model: 'Outback' }, 'in_bay'],
  ['Rosa Medina', { year: 2021, make: 'Kia', model: 'Sorento' }, 'waiting_on_parts'],
  ['Tom Becker', { year: 2017, make: 'Chevrolet', model: 'Malibu' }, 'waiting_on_parts'],
  ['Nina Patel', { year: 2020, make: 'Mazda', model: 'CX-5' }, 'ready_for_pickup'],
  ['Owen Clark', { year: 2014, make: 'Ram', model: '1500' }, 'ready_for_pickup']
];

const CAKES: Array<[string, Record<string, string>, string, number]> = [
  ['Grace Kim', { flavor: 'vanilla', size: '8-inch', inscription: 'Happy Birthday' }, 'ordered', 1],
  ['Luis Romero', { flavor: 'chocolate', size: '10-inch' }, 'ordered', 4],
  ['Emma Wright', { flavor: 'red velvet', size: '10-inch', inscription: 'Congrats' }, 'baking', 4],
  ['Jonas Meyer', { flavor: 'carrot', size: '8-inch' }, 'decorating', 4],
  ['Ada Silva', { flavor: 'lemon', size: '8-inch' }, 'ready', 0],
  ['Ben Haddad', { flavor: 'chocolate', size: '10-inch', inscription: 'Thank You' }, 'ready', 2]
];

/** Siembra los dos negocios del demo. Determinista: la misma corrida produce los mismos datos. */
export async function seedAll(store: Store, now: Date = new Date()): Promise<void> {
  await seedShop(store, now);
  await seedBakery(store, now);
}

async function seedShop(store: Store, now: Date): Promise<void> {
  await store.putBusiness(SHOP);
  await store.putToken(hashToken(DEMO_TOKENS.shop), SHOP.id);
  await store.putItems(SHOP.id, SHOP_ITEMS);

  const profile = loadProfile('auto-repair');
  let n = 0;

  for (const [name, fields, stage] of VEHICLES) {
    n += 1;
    const customerId = `shop-cust-${n}`;
    const assetId = `shop-asset-${n}`;
    await store.putCustomer(SHOP.id, { id: customerId, name, nameNormalized: name.toLowerCase() });
    await store.putAsset(SHOP.id, {
      id: assetId, customerId, fields, spokenLabel: spokenLabel(profile.asset!, fields)
    });

    const order = newOrder({
      id: `shop-ord-${n}`, number: await store.takeOrderNumber(SHOP.id),
      customerId, assetId, fields: {}, stage, now
    });
    await store.putOrder(SHOP.id, order);
  }

  await seedPayments(store, SHOP.id, now, 1234, 9000, 48000);
}

async function seedBakery(store: Store, now: Date): Promise<void> {
  await store.putBusiness(BAKERY);
  await store.putToken(hashToken(DEMO_TOKENS.bakery), BAKERY.id);
  await store.putItems(BAKERY.id, BAKERY_ITEMS);

  let n = 0;
  for (const [name, fields, stage, dueInDays] of CAKES) {
    n += 1;
    const customerId = `bakery-cust-${n}`;
    await store.putCustomer(BAKERY.id, { id: customerId, name, nameNormalized: name.toLowerCase() });

    const due = new Date(now.getTime() + dueInDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const order = newOrder({
      id: `bakery-ord-${n}`, number: await store.takeOrderNumber(BAKERY.id),
      customerId, fields, dueOn: due, stage, now
    });
    await store.putOrder(BAKERY.id, order);
  }

  await seedPayments(store, BAKERY.id, now, 4321, 3000, 14000);
}

/** 30 días de cobros con más movimiento los viernes y sábados. */
async function seedPayments(
  store: Store, bizId: string, now: Date, seed: number, minCents: number, maxCents: number
): Promise<void> {
  const random = mulberry32(seed);

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const date = new Date(now.getTime() - dayOffset * 24 * 3600 * 1000);
    const weekday = date.getUTCDay();
    if (weekday === 0) continue; // cerrado los domingos

    const sales = weekday === 5 || weekday === 6 ? 4 + Math.floor(random() * 3) : 2 + Math.floor(random() * 3);
    for (let i = 0; i < sales; i++) {
      const amount = Math.round(minCents + random() * (maxCents - minCents));
      const paidAt = `${date.toISOString().slice(0, 10)}T${String(14 + (i % 6)).padStart(2, '0')}:05:00.000Z`;
      const order: Order = recalcTotals(
        newOrder({ id: `${bizId}-hist-${dayOffset}-${i}`, number: 1000 + dayOffset * 10 + i,
                   customerId: 'history', fields: {}, stage: 'history', now: date }),
        0
      );
      const payment: Payment = {
        id: `${bizId}-pay-${dayOffset}-${i}`, orderId: order.id,
        amountCents: amount, method: i % 2 === 0 ? 'card' : 'cash', paidAt
      };
      await store.commitClose(bizId, { ...order, totalCents: amount }, payment);
    }
  }
}
