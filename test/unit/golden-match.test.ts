import { describe, expect, it } from 'vitest';
import { argsMatch } from '../../infra/golden/match.js';

describe('golden phrase argument matcher', () => {
  it('with no expected arguments, accepts anything', () => {
    expect(argsMatch({}, { stage: 'in_bay' })).toBe(true);
  });

  it('requires every expected key', () => {
    expect(argsMatch({ stage: 'in_bay' }, {})).toBe(false);
  });

  it('compares text ignoring case, punctuation and leading articles', () => {
    expect(argsMatch({ order: 'the Civic' }, { order: 'civic' })).toBe(true);
    expect(argsMatch({ customerName: 'Dana Lee' }, { customerName: 'dana lee.' })).toBe(true);
  });

  it('accepts text that contains all the expected words', () => {
    expect(argsMatch({ description: 'front brakes' }, { description: 'replace front brakes' })).toBe(true);
    expect(argsMatch({ description: 'front brakes' }, { description: 'rear brakes' })).toBe(false);
  });

  it('treats singular and plural as the same word', () => {
    expect(argsMatch({ item: 'brake rotors' }, { item: 'Brake rotor' })).toBe(true);
    expect(argsMatch({ item: 'glass' }, { item: 'glass' })).toBe(true);
    expect(argsMatch({ item: '10-inch cake boxes' }, { item: '10-inch cake box' })).toBe(true);
  });

  it('compares numbers even when they arrive as text', () => {
    expect(argsMatch({ quantity: 2 }, { quantity: '2' })).toBe(true);
    expect(argsMatch({ quantity: 2 }, { quantity: 3 })).toBe(false);
  });

  it('compares nested objects by their expected keys', () => {
    expect(argsMatch(
      { asset: { year: 2019, make: 'Honda', model: 'Accord' } },
      { asset: { year: 2019, make: 'honda', model: 'Accord', plate: 'X' } }
    )).toBe(true);
    expect(argsMatch({ asset: { model: 'Accord' } }, { asset: { model: 'Civic' } })).toBe(false);
  });

  it('compares booleans and enums exactly', () => {
    expect(argsMatch({ compare: true }, { compare: true })).toBe(true);
    expect(argsMatch({ period: 'this_week' }, { period: 'last_week' })).toBe(false);
  });
});
