import path from 'node:path';
import { hashToken } from '../src/http/auth.js';
import { spokenLabel } from '../src/domain/assets.js';
import { businessToday, resolveDue, shiftDays } from '../src/domain/dates.js';
import { newOrder, recalcTotals } from '../src/domain/orders.js';
import type { Business, CatalogItem, Customer, Order, OrderLine, Payment } from '../src/domain/types.js';
import type { Profile } from '../src/profiles/schema.js';
import type { Store } from '../src/store/store.js';
import { newBlankBusiness } from './business.js';
import { loadPackage, type BusinessPackage } from './package.js';
import { mulberry32 } from './random.js';

export const DEMO_TOKENS = { shop: 'demo-shop-token', bakery: 'demo-bakery-token' };

/** Los negocios que siembra el demo. El reset remoto borra y vuelve a sembrar solo estos. */
export const DEMO_BUSINESS_IDS: readonly string[] = ['shop', 'bakery'];

/** Paquetes de negocio (spec B2 §5.1): una carpeta por negocio. */
export const PACKAGES_DIR = path.join(import.meta.dirname, 'businesses');

/** Token de la floristería en blanco que se siembra en memoria. */
export const DEMO_BLANK_TOKEN = 'demo-florist-token';

const HOUR_MS = 3600 * 1000;

/** Siembra los negocios del demo desde sus paquetes. Determinista: la misma corrida produce los mismos datos. */
export async function seedAll(
  store: Store, now: Date = new Date(), opts: { demoTokens?: boolean } = {}
): Promise<void> {
  const demoTokens = opts.demoTokens ?? true;
  for (const id of DEMO_BUSINESS_IDS) {
    await seedPackage(store, loadPackage(path.join(PACKAGES_DIR, id)), now);
    if (demoTokens) await store.putToken(hashToken(DEMO_TOKENS[id as keyof typeof DEMO_TOKENS]), id);
  }
}

/** Solo en memoria: una floristería en blanco, como la del video, que se configura por voz con el asistente. */
export async function seedLocalBlank(store: Store): Promise<void> {
  await newBlankBusiness(store, { id: 'florist', name: 'Petal and Stem' });
  await store.putToken(hashToken(DEMO_BLANK_TOKEN), 'florist');
}

/** Siembra un negocio activo: META, perfil, catálogo, clientes y órdenes del demo, y 30 días de historia. */
export async function seedPackage(store: Store, pkg: BusinessPackage, now: Date): Promise<void> {
  const business: Business = {
    id: pkg.id, name: pkg.name, status: 'active', profileVersion: 1, timezone: pkg.timezone,
    taxRateBps: pkg.taxRateBps, nextOrderNumber: pkg.firstOrderNumber, version: 1
  };
  await store.putBusiness(business);
  await store.putProfile(pkg.id, { profile: pkg.profile, source: pkg.profileSource, version: 1 });
  await store.putItems(pkg.id, pkg.items);
  await seedDemo(store, business, pkg, now);
  await seedPayments(store, business, pkg.profile, pkg.items, now, pkg.demo.historySeed ?? seedFrom(pkg.id));
}

/** Semilla del PRNG a partir del id, para paquetes sin `historySeed`. */
function seedFrom(id: string): number {
  return [...id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);
}

/** Clientes, activos y órdenes abiertas de `demo.yaml`. */
async function seedDemo(store: Store, biz: Business, pkg: BusinessPackage, now: Date): Promise<void> {
  let n = 0;
  for (const c of pkg.demo.customers) {
    n += 1;
    const customerId = `${biz.id}-cust-${n}`;
    const customer: Customer = { id: customerId, name: c.name, nameNormalized: c.name.toLowerCase() };
    if (c.phone) customer.phone = c.phone;
    await store.putCustomer(biz.id, customer);

    let assetId: string | undefined;
    if (c.asset && pkg.profile.asset) {
      assetId = `${biz.id}-asset-${n}`;
      await store.putAsset(biz.id, { id: assetId, customerId, fields: c.asset, spokenLabel: spokenLabel(pkg.profile.asset, c.asset) });
    }
    if (!c.order) continue;

    // Escalonadas hacia atrás: si todas nacieran "ahora", la ventana de idempotencia de open
    // (§7.8) quedaría armada en cada arranque y el siguiente pedido se leería como repetido.
    const createdAt = new Date(now.getTime() - (c.order.hoursAgo ?? n * 5 + 2) * HOUR_MS);
    // Vencimientos por día de la semana: "tres para el sábado" es cierto siembres el día que siembres.
    const dueOn = c.order.due ? resolveDue(c.order.due, biz.timezone, now) ?? undefined : undefined;
    const order = recalcTotals({
      ...newOrder({
        id: `${biz.id}-ord-${n}`, number: await store.takeOrderNumber(biz.id),
        customerId, assetId, fields: c.order.fields, dueOn, stage: c.order.stage, now: createdAt
      }),
      lines: c.order.lines.map(id => line(itemById(pkg.items, id), 1))
    }, biz.taxRateBps);
    await store.putOrder(biz.id, order);
  }
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

  const today = businessToday(biz.timezone, now);

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    // Fecha civil del negocio; el día de la semana sale de esa fecha, no del reloj UTC.
    const civil = shiftDays(today, -dayOffset);
    const weekday = new Date(`${civil}T12:00:00Z`).getUTCDay();
    if (weekday === 0) continue; // cerrado los domingos

    const sales = weekday === 5 || weekday === 6 ? 4 + Math.floor(random() * 3) : 2 + Math.floor(random() * 3);
    for (let i = 0; i < sales; i++) {
      // 14:05Z–19:05Z cae entre las 8 y las 14 h en Chicago: siempre dentro del mismo día civil.
      const paidAt = `${civil}T${String(14 + (i % 6)).padStart(2, '0')}:05:00.000Z`;
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
        amountCents: order.totalCents, method: i % 2 === 0 ? 'card' : 'cash', paidAt, paidOn: civil
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
