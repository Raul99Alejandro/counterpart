import { hashToken } from '../src/http/auth.js';
import { loadProfile } from '../src/profiles/load.js';
import { spokenLabel } from '../src/domain/assets.js';
import { newOrder, recalcTotals } from '../src/domain/orders.js';
import type { Business, CatalogItem, Customer, Order, OrderLine, Payment } from '../src/domain/types.js';
import type { Profile } from '../src/profiles/schema.js';
import type { Store } from '../src/store/store.js';
import { BAKERY_ITEMS, SHOP_ITEMS, mulberry32 } from './data.js';

export const DEMO_TOKENS = { shop: 'demo-shop-token', bakery: 'demo-bakery-token' };

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
  const random = mulberry32(7331);
  const menu = sellable(SHOP_ITEMS);
  let n = 0;

  for (const [name, fields, stage] of VEHICLES) {
    n += 1;
    const customerId = `shop-cust-${n}`;
    const assetId = `shop-asset-${n}`;
    await store.putCustomer(SHOP.id, { id: customerId, name, nameNormalized: name.toLowerCase() });
    await store.putAsset(SHOP.id, {
      id: assetId, customerId, fields, spokenLabel: spokenLabel(profile.asset!, fields)
    });

    // Escalonadas hacia atrás: si todas nacieran "ahora", la ventana de idempotencia de open
    // (§7.8) quedaría armada en cada arranque y el siguiente pedido se leería como repetido.
    const createdAt = new Date(now.getTime() - (n * 5 + 2) * HOUR_MS);
    const order = recalcTotals({
      ...newOrder({
        id: `shop-ord-${n}`, number: await store.takeOrderNumber(SHOP.id),
        customerId, assetId, fields: {}, stage, now: createdAt
      }),
      lines: pickItems(menu, 1 + Math.floor(random() * 2), random).map(item => line(item, 1))
    }, SHOP.taxRateBps);
    await store.putOrder(SHOP.id, order);
  }

  await seedPayments(store, SHOP, profile, SHOP_ITEMS, now, 1234);
}

async function seedBakery(store: Store, now: Date): Promise<void> {
  await store.putBusiness(BAKERY);
  await store.putToken(hashToken(DEMO_TOKENS.bakery), BAKERY.id);
  await store.putItems(BAKERY.id, BAKERY_ITEMS);

  const profile = loadProfile('bakery');
  const random = mulberry32(9137);
  let n = 0;

  for (const [name, fields, stage, dueInDays] of CAKES) {
    n += 1;
    const customerId = `bakery-cust-${n}`;
    await store.putCustomer(BAKERY.id, { id: customerId, name, nameNormalized: name.toLowerCase() });

    const due = new Date(now.getTime() + dueInDays * DAY_MS).toISOString().slice(0, 10);
    const createdAt = new Date(now.getTime() - (n * 7 + 3) * HOUR_MS);
    // El pastel que se cobra es el del tamaño pedido; a veces lleva relleno extra.
    const cake = itemById(BAKERY_ITEMS, fields.size === '10-inch' ? 'cake-10' : 'cake-8');
    const extras = random() < 0.5 ? [line(itemById(BAKERY_ITEMS, 'filling'), 1)] : [];

    const order = recalcTotals({
      ...newOrder({
        id: `bakery-ord-${n}`, number: await store.takeOrderNumber(BAKERY.id),
        customerId, fields, dueOn: due, stage, now: createdAt
      }),
      lines: [line(cake, 1), ...extras]
    }, BAKERY.taxRateBps);
    await store.putOrder(BAKERY.id, order);
  }

  await seedPayments(store, BAKERY, profile, BAKERY_ITEMS, now, 4321);
}

/**
 * 30 días de cobros con más movimiento los viernes y sábados. Cada venta es una orden cerrada
 * de verdad: con partidas, con su cliente de mostrador y en la etapa de cierre del perfil, para
 * que el reporte de ventas tenga top de ítems y el histórico no se cuele entre lo abierto.
 */
async function seedPayments(
  store: Store, biz: Business, profile: Profile, catalog: CatalogItem[], now: Date, seed: number
): Promise<void> {
  const random = mulberry32(seed);
  const walkIn: Customer = { id: `${biz.id}-cust-walkin`, name: 'Walk-in', nameNormalized: 'walk-in' };
  await store.putCustomer(biz.id, walkIn);
  const menu = sellable(catalog);

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const date = new Date(now.getTime() - dayOffset * DAY_MS);
    const weekday = date.getUTCDay();
    if (weekday === 0) continue; // cerrado los domingos

    const sales = weekday === 5 || weekday === 6 ? 4 + Math.floor(random() * 3) : 2 + Math.floor(random() * 3);
    for (let i = 0; i < sales; i++) {
      const paidAt = `${date.toISOString().slice(0, 10)}T${String(14 + (i % 6)).padStart(2, '0')}:05:00.000Z`;
      const lines = pickItems(menu, 2 + Math.floor(random() * 2), random)
        .map(item => line(item, 1 + Math.floor(random() * 2)));

      const order: Order = recalcTotals({
        ...newOrder({
          id: `${biz.id}-hist-${dayOffset}-${i}`, number: 1000 + dayOffset * 10 + i,
          customerId: walkIn.id, fields: {}, stage: profile.closedStage, now: new Date(paidAt)
        }),
        lines, closedAt: paidAt
      }, biz.taxRateBps);

      const payment: Payment = {
        id: `${biz.id}-pay-${dayOffset}-${i}`, orderId: order.id,
        amountCents: order.totalCents, method: i % 2 === 0 ? 'card' : 'cash', paidAt
      };
      await store.commitClose(biz.id, order, payment);
    }
  }
}

/** Lo que un cliente compra. Ingredientes e insumos son entradas del negocio, no partidas. */
function sellable(items: CatalogItem[]): CatalogItem[] {
  return items.filter(i => i.kind !== 'ingredient' && i.kind !== 'supply');
}

function itemById(items: CatalogItem[], id: string): CatalogItem {
  const found = items.find(i => i.id === id);
  if (!found) throw new Error(`la semilla pide un ítem que no está en el catálogo: ${id}`);
  return found;
}

/** Partida al precio de catálogo. La semilla no descuenta stock: el inventario está curado a mano. */
function line(item: CatalogItem, quantity: number): OrderLine {
  return {
    itemId: item.id, name: item.name, quantity,
    unitPriceCents: item.priceCents, taxable: item.taxable, backordered: 0
  };
}

/** Toma `count` ítems distintos barajando con el PRNG, nunca con Math.random. */
function pickItems(catalog: CatalogItem[], count: number, random: () => number): CatalogItem[] {
  const pool = [...catalog];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
