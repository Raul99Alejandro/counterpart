import { pickBest, tokenScore } from './resolver.js';
import type { CatalogItem, Order, OrderLine, PurchaseOrder } from './types.js';

/** Busca un ítem del catálogo por nombre o sinónimo, con el mismo criterio que las referencias habladas. */
export function findItem(query: string, items: CatalogItem[]):
  | { kind: 'one'; item: CatalogItem }
  | { kind: 'none'; suggestions: CatalogItem[] }
  | { kind: 'ambiguous'; candidates: CatalogItem[] } {
  const scored = items.map(item => ({ value: item, score: tokenScore(query, [item.name, ...item.synonyms].join(' ')) }));
  const picked = pickBest(scored);
  if (picked.kind === 'one') return { kind: 'one', item: picked.value };
  if (picked.kind === 'ambiguous') return { kind: 'ambiguous', candidates: picked.values };
  // Sugerencias solo si se parecen en algo: tres ítems con puntaje 0 no son "closest matches".
  const suggestions = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(s => s.value);
  return { kind: 'none', suggestions };
}

/** Arma la partida y devuelve los ítems con el stock ya descontado. `onHand` nunca baja de cero. */
export function addLineToOrder(
  item: CatalogItem, quantity: number, items: CatalogItem[]
): { line: OrderLine; itemUpdates: CatalogItem[] } {
  // El esquema de la tool ya exige positive(); esto protege a quien llame al dominio directo.
  if (!(quantity > 0)) throw new RangeError(`la cantidad debe ser mayor que cero, no ${quantity}`);
  const updates = new Map<string, CatalogItem>();

  const take = (target: CatalogItem, qty: number): number => {
    if (!target.stocked) return 0;
    const current = updates.get(target.id) ?? target;
    const served = Math.min(current.onHand, qty);
    updates.set(target.id, { ...current, onHand: current.onHand - served });
    return qty - served;
  };

  const backordered = take(item, quantity);

  for (const [consumedId, perUnit] of Object.entries(item.consumes)) {
    const consumed = items.find(i => i.id === consumedId);
    if (consumed) take(consumed, perUnit * quantity);
  }

  return {
    line: {
      itemId: item.id, name: item.name, quantity,
      unitPriceCents: item.priceCents, taxable: item.taxable, backordered
    },
    itemUpdates: [...updates.values()]
  };
}

export function lowStock(items: CatalogItem[]): CatalogItem[] {
  return items.filter(i => i.stocked && i.onHand <= i.reorderPoint);
}

/** Plan de compra agrupado por proveedor. Suma los backorders pendientes y omite lo que ya está pedido. */
export function planReorder(
  items: CatalogItem[], openOrders: Order[], openPOs: PurchaseOrder[], only?: CatalogItem
): { purchaseOrders: Array<{ supplierId: string; lines: Array<{ itemId: string; qty: number }> }>; skipped: CatalogItem[] } {
  const alreadyOrdered = new Set(openPOs.flatMap(po => po.lines.map(l => l.itemId)));
  const backorders = new Map<string, number>();
  for (const order of openOrders) {
    for (const line of order.lines) {
      if (line.backordered > 0) backorders.set(line.itemId, (backorders.get(line.itemId) ?? 0) + line.backordered);
    }
  }

  const candidates = only ? [only] : lowStock(items);
  const skipped: CatalogItem[] = [];
  const bySupplier = new Map<string, Array<{ itemId: string; qty: number }>>();

  for (const item of candidates) {
    if (alreadyOrdered.has(item.id)) { skipped.push(item); continue; }
    const supplierId = item.supplierId ?? 'unassigned';
    const lines = bySupplier.get(supplierId) ?? [];
    lines.push({ itemId: item.id, qty: Math.max(1, item.reorderQty) + (backorders.get(item.id) ?? 0) });
    bySupplier.set(supplierId, lines);
  }

  return {
    purchaseOrders: [...bySupplier.entries()].map(([supplierId, lines]) => ({ supplierId, lines })),
    skipped
  };
}
