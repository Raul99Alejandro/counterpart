import { describe, expect, it } from 'vitest';
import { loadProfile, parseProfile } from '../../src/profiles/load.js';

describe('perfiles', () => {
  it('carga el perfil del taller', () => {
    const p = loadProfile('auto-repair');
    expect(p.toolNames.open).toBe('open_work_order');
    expect(p.stages.map(s => s.id)).toContain('waiting_on_parts');
    expect(p.closedStage).toBe('picked_up');
    expect(p.asset?.noun).toBe('vehicle');
    expect(p.due).toBe('optional');
  });

  it('carga el perfil de la pastelería', () => {
    const p = loadProfile('bakery');
    expect(p.toolNames.open).toBe('take_cake_order');
    expect(p.asset).toBeNull();
    expect(p.orderFields.map(f => f.id)).toEqual(['flavor', 'size', 'inscription']);
    expect(p.due).toBe('required');
  });

  it('rechaza un closedStage que no está en stages', () => {
    expect(() => parseProfile({ ...minimal(), closedStage: 'ghost' })).toThrow(/closedStage/);
  });

  it('rechaza nombres de tool duplicados', () => {
    const bad = minimal();
    bad.toolNames.find = bad.toolNames.open;
    expect(() => parseProfile(bad)).toThrow(/duplicado/);
  });

  it('rechaza un spokenAs con un campo inexistente', () => {
    const bad = minimal();
    bad.asset = { noun: 'vehicle', fields: [{ id: 'make', type: 'string', required: true }], spokenAs: '{year} {make}' };
    expect(() => parseProfile(bad)).toThrow(/spokenAs/);
  });
});

function minimal(): any {
  return {
    id: 'test',
    nouns: { order: 'order', orders: 'orders', item: 'item', items: 'items', customer: 'customer' },
    synonyms: { order: ['ticket'], item: ['part'] },
    toolNames: {
      snapshot: 'get_snapshot', find: 'find_orders', open: 'open_order', move: 'move_order_stage',
      addLine: 'add_to_order', stock: 'check_stock', reorder: 'reorder_stock',
      closeOut: 'close_out_order', salesReport: 'sales_report'
    },
    stages: [{ id: 'new', label: 'new' }, { id: 'done', label: 'done' }],
    closedStage: 'done',
    closeFrom: ['new'],
    asset: null,
    orderFields: [],
    due: 'optional'
  };
}
