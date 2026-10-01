import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Writes a business package to a temporary folder and returns its path. */
export function writePackage(files: Record<string, string>, folder = 'test-shop'): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'counterpart-pkg-')), folder);
  fs.mkdirSync(dir);
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

export const BUSINESS_YAML = `name: Test Bakery
timezone: America/Chicago
taxRateBps: 825
firstOrderNumber: 1
template: bakery
`;

export const CATALOG_YAML = `items:
  - { id: cake-8, name: 8-inch cake, kind: product, unit: cake, priceCents: 4500, stocked: false, consumes: { box-8: 1 } }
  - { id: cupcakes, name: Cupcake dozen, kind: product, unit: dozen, priceCents: 3600, stocked: false }
  - { id: box-8, name: 8-inch box, kind: supply, priceCents: 120, stocked: true, onHand: 40, reorderPoint: 20, reorderQty: 100 }
  - { id: flour, name: Flour, kind: ingredient, unit: pound, priceCents: 90, stocked: true, onHand: 60, reorderPoint: 25, reorderQty: 100, supplierId: mill }
  - { id: delivery, name: Delivery, kind: product, unit: trip, priceCents: 2500, taxable: false, stocked: false }
`;
