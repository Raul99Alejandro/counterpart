import * as z from 'zod/v4';
import type { CatalogItem } from '../domain/types.js';

export const ITEM_KINDS = ['part', 'labor', 'product', 'ingredient', 'supply'] as const;

export const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');

/** An item as written by a person (package) or by Nova (assistant). A single source of truth (spec B2 §5.3). */
export const catalogItemSchema = z.object({
  id: slug,
  name: z.string().min(1),
  synonyms: z.array(z.string().min(1)).default([]),
  kind: z.enum(ITEM_KINDS),
  unit: z.string().min(1).default('each'),
  priceCents: z.number().int().positive(),
  taxable: z.boolean().default(true),
  stocked: z.boolean(),
  onHand: z.number().int().min(0).default(0),
  reorderPoint: z.number().int().min(0).default(0),
  reorderQty: z.number().int().min(0).default(0),
  supplierId: slug.optional(),
  consumes: z.record(slug, z.number().positive()).default({})
}).strict();

export const catalogSchema = z.object({ items: z.array(catalogItemSchema).min(1) }).strict();

export type CatalogItemInput = z.output<typeof catalogItemSchema>;

export function toCatalogItems(items: CatalogItemInput[]): CatalogItem[] {
  return items.map(item => ({ ...item, version: 1 }));
}

/** Cross-item rules a schema cannot express: unique ids, `consumes` pointing to existing items, and no cycles. */
export function catalogProblems(items: Array<Pick<CatalogItem, 'id' | 'consumes'>>, where: string): string[] {
  const problems: string[] = [];
  const firstIndex = new Map<string, number>();
  items.forEach((item, i) => {
    const seen = firstIndex.get(item.id);
    if (seen === undefined) firstIndex.set(item.id, i);
    else problems.push(`${where}[${i}].id: "${item.id}" is already used by ${where}[${seen}]; every item needs its own id`);
  });
  items.forEach((item, i) => {
    for (const target of Object.keys(item.consumes)) {
      if (!firstIndex.has(target)) problems.push(`${where}[${i}].consumes.${target}: there is no item with id "${target}"`);
    }
  });
  const cycle = findCycle(items);
  if (cycle) problems.push(`${where}: items consume each other in a loop (${cycle.join(' → ')}); remove one of those consumes`);
  return problems;
}

function findCycle(items: Array<Pick<CatalogItem, 'id' | 'consumes'>>): string[] | null {
  const graph = new Map(items.map(i => [i.id, Object.keys(i.consumes)]));
  const state = new Map<string, 'visiting' | 'done'>();
  const trail: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') return [...trail.slice(trail.indexOf(id)), id];
    state.set(id, 'visiting');
    trail.push(id);
    for (const next of graph.get(id) ?? []) {
      const found = visit(next);
      if (found) return found;
    }
    trail.pop();
    state.set(id, 'done');
    return null;
  };
  for (const id of graph.keys()) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}
