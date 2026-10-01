import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import * as z from 'zod/v4';
import { loadTemplate } from '../../src/profiles/load.js';
import type { Profile, ToolKey } from '../../src/profiles/schema.js';
import {
  addLineInput, closeOutInput, findInput, itemQueryInput, moveInput, openInput, salesReportInput, toolSpecs
} from '../../src/tools/specs.js';

interface Golden { profile: string; phrases: Array<{ say: string; tool: string; args: Record<string, unknown> }> }

function inputFor(profile: Profile, key: ToolKey): z.ZodObject<z.ZodRawShape> {
  switch (key) {
    case 'snapshot': return z.object({});
    case 'find': return findInput(profile);
    case 'open': return openInput(profile);
    case 'move': return moveInput(profile);
    case 'addLine': return addLineInput(profile);
    case 'stock':
    case 'reorder': return itemQueryInput(profile);
    case 'closeOut': return closeOutInput(profile);
    case 'salesReport': return salesReportInput;
  }
}

for (const file of ['auto-repair.yaml', 'bakery.yaml']) {
  const golden = parseYaml(fs.readFileSync(path.join(import.meta.dirname, '..', 'golden', file), 'utf8')) as Golden;
  const profile = loadTemplate(golden.profile);
  const keyByName = new Map(Object.entries(toolSpecs(profile)).map(([key, spec]) => [spec.name, key as ToolKey]));

  describe(`golden phrases: ${golden.profile}`, () => {
    it('has at least 20 phrases and covers all nine tools', () => {
      expect(golden.phrases.length).toBeGreaterThanOrEqual(20);
      expect(new Set(golden.phrases.map(p => p.tool))).toEqual(new Set(keyByName.keys()));
    });

    for (const phrase of golden.phrases) {
      it(`"${phrase.say}" points to a real tool with valid arguments`, () => {
        const key = keyByName.get(phrase.tool);
        expect(key, `unknown tool: ${phrase.tool}`).toBeDefined();
        const schema = inputFor(profile, key!);
        for (const arg of Object.keys(phrase.args)) {
          expect(Object.keys(schema.shape), `unknown argument: ${arg}`).toContain(arg);
        }
        expect(schema.safeParse(phrase.args).success, 'invalid or incomplete arguments').toBe(true);
      });
    }
  });
}
