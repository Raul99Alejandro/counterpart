import type { CatalogItem } from '../src/domain/types.js';

type ItemSeed = Omit<CatalogItem, 'version'>;

const item = (i: Partial<ItemSeed> & { id: string; name: string }): CatalogItem => ({
  synonyms: [], kind: 'part', unit: 'each', priceCents: 1000, taxable: true, stocked: true,
  onHand: 10, reorderPoint: 3, reorderQty: 12, supplierId: 'sup-1', consumes: {}, version: 1, ...i
});

export const SHOP_ITEMS: CatalogItem[] = [
  item({ id: 'pads-front', name: 'Front brake pads', synonyms: ['brake pads', 'pads'], priceCents: 4500, onHand: 1, reorderPoint: 2 }),
  item({ id: 'pads-rear', name: 'Rear brake pads', synonyms: [], priceCents: 4200, onHand: 6 }),
  item({ id: 'rotor', name: 'Brake rotor', synonyms: ['rotor'], priceCents: 6800, onHand: 2, reorderPoint: 4 }),
  item({ id: 'oil-filter', name: 'Oil filter', synonyms: ['filter'], priceCents: 900, onHand: 3, reorderPoint: 5 }),
  item({ id: 'oil-5w30', name: '5W-30 quart', synonyms: ['5w30', 'oil'], unit: 'quart', priceCents: 750, onHand: 24, reorderPoint: 10 }),
  item({ id: 'air-filter', name: 'Air filter', synonyms: [], priceCents: 1900, onHand: 7 }),
  item({ id: 'wiper', name: 'Wiper blade', synonyms: ['wipers'], priceCents: 1600, onHand: 9 }),
  item({ id: 'battery', name: 'Battery', synonyms: [], priceCents: 15900, onHand: 2, reorderPoint: 2, supplierId: 'sup-2' }),
  item({ id: 'coolant', name: 'Coolant gallon', synonyms: ['antifreeze'], unit: 'gallon', priceCents: 2400, onHand: 5, supplierId: 'sup-2' }),
  item({ id: 'spark-plug', name: 'Spark plug', synonyms: ['plugs'], priceCents: 1200, onHand: 16 }),
  item({ id: 'labor-oil', name: 'Oil change', kind: 'labor', stocked: false, taxable: false, unit: 'job', priceCents: 6000, consumes: { 'oil-filter': 1, 'oil-5w30': 5 } }),
  item({ id: 'labor-brake', name: 'Brake job labor', kind: 'labor', stocked: false, taxable: false, unit: 'hour', priceCents: 12000 }),
  item({ id: 'labor-diag', name: 'Diagnostic', kind: 'labor', stocked: false, taxable: false, unit: 'hour', priceCents: 9500 }),
  item({ id: 'labor-align', name: 'Alignment', kind: 'labor', stocked: false, taxable: false, unit: 'job', priceCents: 11000 })
];

export const BAKERY_ITEMS: CatalogItem[] = [
  item({ id: 'cake-8', name: '8-inch round cake', kind: 'product', stocked: false, priceCents: 4500, unit: 'cake', consumes: { 'box-8': 1, 'board-8': 1 } }),
  item({ id: 'cake-10', name: '10-inch round cake', kind: 'product', stocked: false, priceCents: 6500, unit: 'cake', consumes: { 'box-10': 1, 'board-10': 1 } }),
  item({ id: 'cupcakes', name: 'Cupcake dozen', kind: 'product', stocked: false, priceCents: 3600, unit: 'dozen' }),
  item({ id: 'filling', name: 'Custom filling', kind: 'product', stocked: false, priceCents: 900, unit: 'each' }),
  item({ id: 'delivery', name: 'Delivery', kind: 'product', stocked: false, taxable: false, priceCents: 2500, unit: 'trip' }),
  item({ id: 'box-8', name: '8-inch cake box', kind: 'supply', priceCents: 120, onHand: 40, reorderPoint: 20, reorderQty: 100 }),
  item({ id: 'box-10', name: '10-inch cake box', kind: 'supply', priceCents: 150, onHand: 12, reorderPoint: 20, reorderQty: 100 }),
  item({ id: 'board-8', name: '8-inch cake board', kind: 'supply', priceCents: 80, onHand: 35, reorderPoint: 20, reorderQty: 100 }),
  item({ id: 'board-10', name: '10-inch cake board', kind: 'supply', priceCents: 95, onHand: 8, reorderPoint: 20, reorderQty: 100 }),
  item({ id: 'flour', name: 'Flour', kind: 'ingredient', unit: 'pound', priceCents: 90, onHand: 60, reorderPoint: 25, reorderQty: 100, supplierId: 'sup-3' }),
  item({ id: 'butter', name: 'Butter', kind: 'ingredient', unit: 'pound', priceCents: 480, onHand: 14, reorderPoint: 20, reorderQty: 40, supplierId: 'sup-3' }),
  item({ id: 'cocoa', name: 'Cocoa powder', kind: 'ingredient', unit: 'pound', priceCents: 720, onHand: 6, reorderPoint: 8, reorderQty: 20, supplierId: 'sup-3' })
];

/** PRNG determinista, para que la semilla sea idéntica en cada corrida. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
