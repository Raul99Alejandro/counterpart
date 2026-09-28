import { describe, expect, it } from 'vitest';
import { checkPackage } from '../../seed/package.js';
import { BUSINESS_YAML, CATALOG_YAML, writePackage } from '../helpers/packages.js';

const problemsOf = (files: Record<string, string>, folder?: string): string[] => {
  const result = checkPackage(writePackage(files, folder));
  return result.ok ? [] : result.problems;
};

describe('chequeo de paquetes de negocio', () => {
  it('acepta un paquete válido con plantilla', () => {
    const result = checkPackage(writePackage({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': CATALOG_YAML }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pkg.id).toBe('test-shop');
      expect(result.pkg.profileSource).toBe('template:bakery');
      expect(result.pkg.items.find(i => i.id === 'cupcakes')).toMatchObject({ taxable: true, onHand: 0, version: 1 });
    }
  });

  it('pide un nombre de carpeta que sirva de id', () => {
    expect(problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': CATALOG_YAML }, 'Test Shop')[0])
      .toMatch(/folder name "Test Shop"/);
  });

  it('avisa si falta un archivo', () => {
    expect(problemsOf({ 'business.yaml': BUSINESS_YAML })).toContain('catalog.yaml: file not found');
  });

  it('avisa si el YAML está roto', () => {
    expect(problemsOf({ 'business.yaml': 'name: [', 'catalog.yaml': CATALOG_YAML })[0]).toMatch(/^business\.yaml: not valid YAML/);
  });

  it('no acepta plantilla y perfil a la vez', () => {
    const both = `${BUSINESS_YAML}profile: { id: x }\n`;
    expect(problemsOf({ 'business.yaml': both, 'catalog.yaml': CATALOG_YAML }).join('\n')).toMatch(/either template or profile/);
  });

  it('nombra las plantillas que existen', () => {
    const bad = BUSINESS_YAML.replace('template: bakery', 'template: florist');
    expect(problemsOf({ 'business.yaml': bad, 'catalog.yaml': CATALOG_YAML }).join('\n'))
      .toMatch(/there is no template "florist"; use one of auto-repair, bakery/);
  });

  it('dice el campo exacto y cómo arreglar un precio', () => {
    const bad = CATALOG_YAML.replace('priceCents: 4500', 'priceCents: 45.5');
    const text = problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': bad }).join('\n');
    expect(text).toMatch(/catalog\.yaml › items\[0\]\.priceCents: .*cents as a whole number/);
  });

  it('detecta un consumes hacia un ítem que no existe', () => {
    const bad = CATALOG_YAML.replace('consumes: { box-8: 1 }', 'consumes: { box-10: 1 }');
    expect(problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': bad }).join('\n'))
      .toMatch(/items\[0\]\.consumes\.box-10: there is no item with id "box-10"/);
  });

  it('detecta ids repetidos', () => {
    const bad = CATALOG_YAML.replace('id: cupcakes', 'id: cake-8');
    expect(problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': bad }).join('\n'))
      .toMatch(/items\[1\]\.id: "cake-8" is already used by items\[0\]/);
  });

  it('detecta ítems que se consumen en círculo', () => {
    const bad = CATALOG_YAML.replace(
      'priceCents: 120, stocked: true, onHand: 40',
      'priceCents: 120, stocked: true, consumes: { cake-8: 1 }, onHand: 40'
    );
    expect(problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': bad }).join('\n')).toMatch(/consume each other in a loop/);
  });

  it('valida un perfil propio con las reglas del servidor', () => {
    const own = `name: Test Place
timezone: America/Chicago
taxRateBps: 0
profile:
  id: own
  nouns: { order: job, orders: jobs, item: part, items: parts, customer: client }
  synonyms: { order: [], item: [] }
  toolNames: { snapshot: get_jobs_snapshot, find: find_jobs, open: open_job, move: move_job, addLine: add_to_job, stock: check_parts, reorder: reorder_parts, closeOut: close_out_job, salesReport: sales_report }
  stages: [{ id: new, label: new }, { id: done, label: done }]
  closedStage: finished
  closeFrom: [new]
  asset: null
  orderFields: []
  due: none
`;
    expect(problemsOf({ 'business.yaml': own, 'catalog.yaml': CATALOG_YAML }).join('\n'))
      .toMatch(/business\.yaml › profile: closedStage "finished" is not one of the stages/);
  });

  it('revisa el demo contra el perfil', () => {
    const demo = `customers:
  - name: Grace Kim
    order: { stage: shipped, fields: { size: 8-inch }, due: saturday, lines: [cake-8] }
`;
    const text = problemsOf({ 'business.yaml': BUSINESS_YAML, 'catalog.yaml': CATALOG_YAML, 'demo.yaml': demo }).join('\n');
    expect(text).toMatch(/customers\[0\]\.order\.stage: "shipped" is not an open stage/);
    expect(text).toMatch(/customers\[0\]\.order\.fields\.flavor: required by the profile/);
  });
});
