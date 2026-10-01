import { describe, expect, it } from 'vitest';
import { formatMoney, taxOn } from '../../src/domain/money.js';

describe('money', () => {
  it('formats cents', () => {
    expect(formatMoney(41250)).toBe('$412.50');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(5)).toBe('$0.05');
  });

  it('computes tax with half-up rounding', () => {
    expect(taxOn(10000, 825)).toBe(825);
    expect(taxOn(1250, 825)).toBe(103);   // 103.125 -> 103
    expect(taxOn(1000, 825)).toBe(83);    // 82.5 -> 83
    expect(taxOn(0, 825)).toBe(0);
  });
});
