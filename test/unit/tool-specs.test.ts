import { describe, expect, it } from 'vitest';
import { loadProfile } from '../../src/profiles/load.js';
import { findInput, openInput, toolSpecs } from '../../src/tools/specs.js';

const shop = loadProfile('auto-repair');
const bakery = loadProfile('bakery');

describe('generación de tools', () => {
  it('toma los nombres del perfil', () => {
    expect(toolSpecs(shop).open.name).toBe('open_work_order');
    expect(toolSpecs(bakery).open.name).toBe('take_cake_order');
  });

  it('mete los sinónimos en la descripción', () => {
    const d = toolSpecs(shop).find.description;
    expect(d).toContain('repair order');
    expect(d).toContain('RO');
    expect(d.toLowerCase()).not.toContain('json');
  });

  it('el esquema de abrir exige el activo en el taller', () => {
    const schema = openInput(shop);
    expect(schema.safeParse({ customerName: 'Dana Lee' }).success).toBe(false);
    expect(schema.safeParse({
      customerName: 'Dana Lee', asset: { year: 2019, make: 'Honda', model: 'Civic' }
    }).success).toBe(true);
  });

  it('el esquema de abrir exige due y campos propios en la pastelería', () => {
    const schema = openInput(bakery);
    expect(schema.safeParse({ customerName: 'Priya Shah', flavor: 'chocolate', size: '10-inch' }).success).toBe(false);
    expect(schema.safeParse({
      customerName: 'Priya Shah', flavor: 'chocolate', size: '10-inch', due: 'saturday'
    }).success).toBe(true);
  });

  it('el esquema de buscar acepta solo etapas del perfil', () => {
    expect(findInput(shop).safeParse({ stage: 'waiting_on_parts' }).success).toBe(true);
    expect(findInput(shop).safeParse({ stage: 'baking' }).success).toBe(false);
    expect(findInput(shop).safeParse({}).success).toBe(true);
  });
});
