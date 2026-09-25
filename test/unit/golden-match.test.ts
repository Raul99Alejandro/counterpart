import { describe, expect, it } from 'vitest';
import { argsMatch } from '../../infra/golden/match.js';

describe('comparador de argumentos de las frases de oro', () => {
  it('sin argumentos esperados, acepta cualquier cosa', () => {
    expect(argsMatch({}, { stage: 'in_bay' })).toBe(true);
  });

  it('exige cada llave esperada', () => {
    expect(argsMatch({ stage: 'in_bay' }, {})).toBe(false);
  });

  it('compara texto sin mayúsculas, puntuación ni artículos al inicio', () => {
    expect(argsMatch({ order: 'the Civic' }, { order: 'civic' })).toBe(true);
    expect(argsMatch({ customerName: 'Dana Lee' }, { customerName: 'dana lee.' })).toBe(true);
  });

  it('acepta texto que contiene todas las palabras esperadas', () => {
    expect(argsMatch({ description: 'front brakes' }, { description: 'replace front brakes' })).toBe(true);
    expect(argsMatch({ description: 'front brakes' }, { description: 'rear brakes' })).toBe(false);
  });

  it('trata singular y plural como la misma palabra', () => {
    expect(argsMatch({ item: 'brake rotors' }, { item: 'Brake rotor' })).toBe(true);
    expect(argsMatch({ item: 'glass' }, { item: 'glass' })).toBe(true);
    expect(argsMatch({ item: '10-inch cake boxes' }, { item: '10-inch cake box' })).toBe(true);
  });

  it('compara números aunque lleguen como texto', () => {
    expect(argsMatch({ quantity: 2 }, { quantity: '2' })).toBe(true);
    expect(argsMatch({ quantity: 2 }, { quantity: 3 })).toBe(false);
  });

  it('compara objetos anidados por sus llaves esperadas', () => {
    expect(argsMatch(
      { asset: { year: 2019, make: 'Honda', model: 'Accord' } },
      { asset: { year: 2019, make: 'honda', model: 'Accord', plate: 'X' } }
    )).toBe(true);
    expect(argsMatch({ asset: { model: 'Accord' } }, { asset: { model: 'Civic' } })).toBe(false);
  });

  it('compara booleanos y enums exactos', () => {
    expect(argsMatch({ compare: true }, { compare: true })).toBe(true);
    expect(argsMatch({ period: 'this_week' }, { period: 'last_week' })).toBe(false);
  });
});
