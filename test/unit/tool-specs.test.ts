import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { loadProfile } from '../../src/profiles/load.js';
import {
  addLineInput, closeOutInput, findInput, moveInput, openInput, toolSpecs
} from '../../src/tools/specs.js';

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

  it('las descripciones de los parámetros no llevan vocabulario del taller a otro perfil', () => {
    const described = (schema: ReturnType<typeof moveInput>, key: string): string => {
      const json = z.toJSONSchema(schema) as { properties?: Record<string, { description?: string }> };
      return json.properties?.[key]?.description ?? '';
    };

    const order = described(moveInput(bakery), 'order');
    expect(order).not.toContain('Civic');
    expect(order.toLowerCase()).not.toContain('job');
    expect(order).toContain('cake order');

    const shopOrder = described(moveInput(shop), 'order');
    expect(shopOrder).toContain('work order');
    expect(shopOrder).toContain('vehicle'); // el activo del perfil sirve de ejemplo

    expect(described(findInput(bakery), 'stage').toLowerCase()).not.toContain('job');
    expect(described(findInput(bakery), 'query').toLowerCase()).not.toContain('job');
    expect(described(openInput(bakery), 'description').toLowerCase()).not.toContain('job');
    expect(described(closeOutInput(bakery), 'order').toLowerCase()).not.toContain('job');
    expect(described(addLineInput(bakery), 'order').toLowerCase()).not.toContain('job');
    expect(described(openInput(shop), 'asset').toLowerCase()).not.toContain('job');
    expect(toolSpecs(bakery).open.description.toLowerCase()).not.toContain('job');
  });

  it('usa el artículo correcto según el sustantivo del perfil', () => {
    expect(toolSpecs(bakery).addLine.description).toContain('an ingredient');
    expect(toolSpecs(bakery).addLine.description).not.toContain('a ingredient');
    expect(toolSpecs(shop).addLine.description).toContain('a part');
  });

  describe('lo que pidieron las frases de oro contra Nova 2 Lite', () => {
    const described = (schema: ReturnType<typeof openInput>, key: string): string => {
      const json = z.toJSONSchema(schema) as { properties?: Record<string, { description?: string }> };
      return json.properties?.[key]?.description ?? '';
    };

    it('los campos propios de la orden dicen qué son', () => {
      expect(described(openInput(bakery), 'flavor')).toContain('flavor');
      expect(described(openInput(bakery), 'size')).toContain('cake order');
    });

    it('abrir una orden pide usar lo que el usuario ya dijo y no preguntar lo opcional', () => {
      const d = toolSpecs(bakery).open.description;
      expect(d).toContain('Fill in every detail the user already gave');
      expect(d).toContain('phone number');
    });

    it('el resumen del día cubre "what is on the board today"', () => {
      expect(toolSpecs(bakery).snapshot.description).toContain("what's on the board");
    });
  });
});
