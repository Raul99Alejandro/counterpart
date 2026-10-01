import { describe, expect, it } from 'vitest';
import { loadTemplate, parseProfile } from '../../src/profiles/load.js';

describe('profiles', () => {
  it('loads the auto repair shop profile', () => {
    const p = loadTemplate('auto-repair');
    expect(p.toolNames.open).toBe('open_work_order');
    expect(p.stages.map(s => s.id)).toContain('waiting_on_parts');
    expect(p.closedStage).toBe('picked_up');
    expect(p.asset?.noun).toBe('vehicle');
    expect(p.due).toBe('optional');
  });

  it('loads the bakery profile', () => {
    const p = loadTemplate('bakery');
    expect(p.toolNames.open).toBe('take_cake_order');
    expect(p.asset).toBeNull();
    expect(p.orderFields.map(f => f.id)).toEqual(['flavor', 'size', 'inscription']);
    expect(p.due).toBe('required');
  });

  it('rejects a closedStage that is not in stages', () => {
    expect(() => parseProfile({ ...minimal(), closedStage: 'ghost' })).toThrow(/closedStage/);
  });

  it('rejects duplicate tool names', () => {
    const bad = minimal();
    bad.toolNames.find = bad.toolNames.open;
    expect(() => parseProfile(bad)).toThrow(/used twice/);
  });

  it('rejects a spokenAs with a field that does not exist', () => {
    const bad = minimal();
    bad.asset = { noun: 'vehicle', fields: [{ id: 'make', type: 'string', required: true }], spokenAs: '{year} {make}' };
    expect(() => parseProfile(bad)).toThrow(/spokenAs/);
  });

  it('rejects an orderFields entry with an id reserved by the tools', () => {
    const bad = minimal();
    bad.orderFields = [{ id: 'due', type: 'string', required: true }];
    expect(() => parseProfile(bad)).toThrow(/reserved/);
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
