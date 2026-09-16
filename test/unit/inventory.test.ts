import { describe, expect, it } from 'vitest';
import { addLineToOrder, findItem, lowStock, planReorder } from '../../src/domain/inventory.js';
import type { CatalogItem, Order } from '../../src/domain/types.js';

function item(over: Partial<CatalogItem> & { id: string; name: string }): CatalogItem {
  return {
    synonyms: [], kind: 'part', unit: 'each', priceCents: 1000, taxable: true, stocked: true,
    onHand: 10, reorderPoint: 2, reorderQty: 12, supplierId: 's1', consumes: {}, version: 1, ...over
  };
}

const pads = item({ id: 'i1', name: 'Front brake pads', synonyms: ['brake pads'], onHand: 1, priceCents: 4500 });
const filter = item({ id: 'i2', name: 'Oil filter', onHand: 4, reorderPoint: 5 });
const oil = item({ id: 'i3', name: '5W-30 quart', synonyms: ['5w30'], onHand: 20, unit: 'quart' });
const oilChange = item({
  id: 'i4', name: 'Oil change', kind: 'labor', stocked: false, taxable: false,
  priceCents: 6000, consumes: { i2: 1, i3: 5 }
});

const emptyOrder: Order = {
  id: 'o1', number: 42, customerId: 'c1', stage: 'estimate', fields: {}, lines: [],
  subtotalCents: 0, taxCents: 0, totalCents: 0, stageHistory: [], createdAt: '2026-09-15T15:00:00.000Z', version: 1
};

describe('inventario', () => {
  it('encuentra un ítem por nombre o sinónimo', () => {
    expect(findItem('brake pads', [pads, filter])).toEqual({ kind: 'one', item: pads });
    expect(findItem('5w30', [oil, filter])).toEqual({ kind: 'one', item: oil });
  });

  it('devuelve sugerencias cuando no encuentra nada', () => {
    const r = findItem('blinker fluid', [pads, filter, oil]);
    expect(r.kind).toBe('none');
  });

  it('descuenta stock y marca backorder cuando no alcanza', () => {
    const { line, itemUpdates } = addLineToOrder(pads, 2, [pads, filter, oil]);
    expect(line).toEqual({
      itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 1
    });
    expect(itemUpdates.find(i => i.id === 'i1')!.onHand).toBe(0);
  });

  it('descuenta también lo que el ítem consume', () => {
    const { itemUpdates } = addLineToOrder(oilChange, 1, [pads, filter, oil, oilChange]);
    expect(itemUpdates.find(i => i.id === 'i2')!.onHand).toBe(3);
    expect(itemUpdates.find(i => i.id === 'i3')!.onHand).toBe(15);
  });

  it('lista lo que está en o por debajo del punto de reorden', () => {
    expect(lowStock([pads, filter, oil, oilChange]).map(i => i.id)).toEqual(['i1', 'i2']);
  });

  it('agrupa el reorden por proveedor y suma los backorders', () => {
    const orderWithBackorder: Order = {
      ...emptyOrder,
      lines: [{ itemId: 'i1', name: 'Front brake pads', quantity: 2, unitPriceCents: 4500, taxable: true, backordered: 1 }]
    };
    const r = planReorder([pads, filter], [orderWithBackorder], []);
    expect(r.purchaseOrders).toEqual([
      { supplierId: 's1', lines: [{ itemId: 'i1', qty: 13 }, { itemId: 'i2', qty: 12 }] }
    ]);
  });

  it('omite ítems que ya tienen orden de compra abierta', () => {
    const r = planReorder([pads, filter], [], [
      { id: 'po1', supplierId: 's1', lines: [{ itemId: 'i1', qty: 12 }], status: 'open', createdAt: '2026-09-14T00:00:00.000Z' }
    ]);
    expect(r.skipped.map(i => i.id)).toEqual(['i1']);
    expect(r.purchaseOrders).toEqual([{ supplierId: 's1', lines: [{ itemId: 'i2', qty: 12 }] }]);
  });
});
