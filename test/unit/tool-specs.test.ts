import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { loadTemplate } from '../../src/profiles/load.js';
import {
  addLineInput, closeOutInput, findInput, moveInput, openInput, toolSpecs
} from '../../src/tools/specs.js';

const shop = loadTemplate('auto-repair');
const bakery = loadTemplate('bakery');

describe('tool generation', () => {
  it('takes the names from the profile', () => {
    expect(toolSpecs(shop).open.name).toBe('open_work_order');
    expect(toolSpecs(bakery).open.name).toBe('take_cake_order');
  });

  it('puts the synonyms in the description', () => {
    const d = toolSpecs(shop).find.description;
    expect(d).toContain('repair order');
    expect(d).toContain('RO');
    expect(d.toLowerCase()).not.toContain('json');
  });

  it('the open schema requires the asset in the auto repair shop', () => {
    const schema = openInput(shop);
    expect(schema.safeParse({ customerName: 'Dana Lee' }).success).toBe(false);
    expect(schema.safeParse({
      customerName: 'Dana Lee', asset: { year: 2019, make: 'Honda', model: 'Civic' }
    }).success).toBe(true);
  });

  it('the open schema requires due and the custom fields in the bakery', () => {
    const schema = openInput(bakery);
    expect(schema.safeParse({ customerName: 'Priya Shah', flavor: 'chocolate', size: '10-inch' }).success).toBe(false);
    expect(schema.safeParse({
      customerName: 'Priya Shah', flavor: 'chocolate', size: '10-inch', due: 'saturday'
    }).success).toBe(true);
  });

  it('the find schema accepts only profile stages', () => {
    expect(findInput(shop).safeParse({ stage: 'waiting_on_parts' }).success).toBe(true);
    expect(findInput(shop).safeParse({ stage: 'baking' }).success).toBe(false);
    expect(findInput(shop).safeParse({}).success).toBe(true);
  });

  it('parameter descriptions do not carry auto repair vocabulary into another profile', () => {
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
    expect(shopOrder).toContain('vehicle'); // the profile asset serves as the example

    expect(described(findInput(bakery), 'stage').toLowerCase()).not.toContain('job');
    expect(described(findInput(bakery), 'query').toLowerCase()).not.toContain('job');
    expect(described(openInput(bakery), 'description').toLowerCase()).not.toContain('job');
    expect(described(closeOutInput(bakery), 'order').toLowerCase()).not.toContain('job');
    expect(described(addLineInput(bakery), 'order').toLowerCase()).not.toContain('job');
    expect(described(openInput(shop), 'asset').toLowerCase()).not.toContain('job');
    expect(toolSpecs(bakery).open.description.toLowerCase()).not.toContain('job');
  });

  it('uses the right article for the profile noun', () => {
    expect(toolSpecs(bakery).addLine.description).toContain('an ingredient');
    expect(toolSpecs(bakery).addLine.description).not.toContain('a ingredient');
    expect(toolSpecs(shop).addLine.description).toContain('a part');
  });

  describe('what the golden phrases against Nova 2 Lite asked for', () => {
    const described = (schema: ReturnType<typeof openInput>, key: string): string => {
      const json = z.toJSONSchema(schema) as { properties?: Record<string, { description?: string }> };
      return json.properties?.[key]?.description ?? '';
    };

    it('the custom order fields say what they are', () => {
      expect(described(openInput(bakery), 'flavor')).toContain('flavor');
      expect(described(openInput(bakery), 'size')).toContain('cake order');
    });

    it('opening an order asks to use what the user already said and not ask for optional details', () => {
      const d = toolSpecs(bakery).open.description;
      expect(d).toContain('Fill in every detail the user already gave');
      expect(d).toContain('phone number');
    });

    it('opening an order names what the profile requires and asks to leave out the rest', () => {
      const d = toolSpecs(bakery).open.description;
      expect(d).toContain("Needed: the customer's name, flavor, size and the due date.");
      expect(d).toContain('Leave anything else out instead of asking for it');
      expect(toolSpecs(shop).open.description).toContain("Needed: the customer's name and the vehicle.");
    });

    it('an order reference accepts the customer name without asking for the number', () => {
      const json = z.toJSONSchema(addLineInput(bakery)) as { properties?: Record<string, { description?: string }> };
      expect(json.properties?.order?.description).toContain('never ask for the cake order number');
    });

    it('the daily snapshot covers "what is on the board today"', () => {
      expect(toolSpecs(bakery).snapshot.description).toContain("what's on the board");
    });
  });
  it('says underscored field ids as words', () => {
    const florist = { ...bakery, orderFields: [{ id: 'card_message', type: 'string' as const, required: true }] };
    const schema = openInput(florist);
    const described = (schema.shape as Record<string, { description?: string }>).card_message?.description;
    expect(described).toBe('The card message of the cake order, as the user said it.');
    expect(toolSpecs(florist).open.description).toContain("Needed: the customer's name, card message and the due date.");
  });
});
