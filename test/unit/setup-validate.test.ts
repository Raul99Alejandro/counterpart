import { describe, expect, it } from 'vitest';
import {
  CATALOG_QUESTION, GENERIC_QUESTION, STAGES_QUESTION, spokenFailure, validateSetup
} from '../../src/setup/validate.js';
import { floristDraft } from '../helpers/setup.js';

const errorsOf = (raw: unknown): string[] => {
  const result = validateSetup(raw);
  return result.ok ? [] : result.errors;
};

describe('validación del borrador del asistente', () => {
  it('acepta un borrador válido y completa los valores por defecto', () => {
    const result = validateSetup(floristDraft());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.setup.items).toHaveLength(7);
      expect(result.setup.items[0]).toMatchObject({ taxable: true, onHand: 0, version: 1 });
      expect(result.setup.profile.closedStage).toBe('delivered');
    }
  });

  it('capa 1: el esquema señala la ruta exacta', () => {
    const d = floristDraft();
    d.catalog.items[0].priceCents = 0;
    expect(errorsOf(d).join('\n')).toMatch(/catalog\.items\[0\]\.priceCents/);
  });

  it('capa 2: las reglas del perfil del servidor', () => {
    const d = floristDraft();
    d.profile.closedStage = 'done';
    expect(errorsOf(d)).toEqual(['profile: closedStage "done" is not one of the stages']);
  });

  it('capa 3: una tool no puede llamarse como una de alta', () => {
    const d = floristDraft();
    d.profile.toolNames.find = 'review_business_setup';
    expect(errorsOf(d).join('\n')).toMatch(/profile\.toolNames\.find: "review_business_setup" is reserved/);
  });

  it('capa 3: como máximo 8 etapas', () => {
    const d = floristDraft();
    d.profile.stages = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, label: `step ${i}` }));
    d.profile.closedStage = 's8';
    d.profile.closeFrom = ['s7'];
    expect(errorsOf(d).join('\n')).toMatch(/9 stages is too many; use at most 8/);
  });

  it('capa 3: entre 5 y 60 ítems', () => {
    const d = floristDraft();
    d.catalog.items = d.catalog.items.slice(3); // 4 ítems, sin consumes rotos
    expect(errorsOf(d).join('\n')).toMatch(/4 items; use between 5 and 60/);
  });

  it('capa 3: consumes hacia ítems existentes y sin ciclos', () => {
    const d = floristDraft();
    d.catalog.items[1].consumes = { ribbon: 1 };
    d.catalog.items[5].consumes = { 'dozen-roses': 1 };
    const text = errorsOf(d).join('\n');
    expect(text).toMatch(/catalog\.items\[1\]\.consumes\.ribbon: there is no item with id "ribbon"/);
    expect(text).toMatch(/consume each other in a loop/);
  });

  it('elige la pregunta hablada según lo que faltó', () => {
    expect(spokenFailure(['profile: closedStage "done" is not one of the stages'])).toBe(STAGES_QUESTION);
    expect(spokenFailure(['profile.stages: Too small: expected array to have >=2 items'])).toBe(STAGES_QUESTION);
    expect(spokenFailure(['catalog.items: 4 items; use between 5 and 60'])).toBe(CATALOG_QUESTION);
    expect(spokenFailure(['the model did not return a setup (timeout)'])).toBe(GENERIC_QUESTION);
    expect(STAGES_QUESTION).toBe("I couldn't tell how an order moves from start to finish. What steps does an order go through?");
  });
});
