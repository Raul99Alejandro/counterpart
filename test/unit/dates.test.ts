import { describe, expect, it } from 'vitest';
import { businessToday, periodRange, resolveDue } from '../../src/domain/dates.js';

const TZ = 'America/Chicago';

describe('fechas', () => {
  it('usa la zona del negocio, no la del servidor', () => {
    // 2026-09-15T02:30:00Z sigue siendo 14 de septiembre en Chicago
    expect(businessToday(TZ, new Date('2026-09-15T02:30:00Z'))).toBe('2026-09-14');
  });

  it('resuelve today y tomorrow', () => {
    const now = new Date('2026-09-15T15:00:00Z'); // martes 15 en Chicago
    expect(resolveDue('today', TZ, now)).toBe('2026-09-15');
    expect(resolveDue('tomorrow', TZ, now)).toBe('2026-09-16');
  });

  it('resuelve el próximo día de la semana, incluyendo hoy', () => {
    const now = new Date('2026-09-15T15:00:00Z'); // martes
    expect(resolveDue('saturday', TZ, now)).toBe('2026-09-19');
    expect(resolveDue('tuesday', TZ, now)).toBe('2026-09-15');
  });

  it('acepta una fecha explícita y rechaza basura', () => {
    const now = new Date('2026-09-15T15:00:00Z');
    expect(resolveDue('2026-12-24', TZ, now)).toBe('2026-12-24');
    expect(resolveDue('whenever', TZ, now)).toBeNull();
  });

  it('calcula la semana actual de lunes a domingo y la anterior', () => {
    const now = new Date('2026-09-15T15:00:00Z'); // martes
    expect(periodRange('this_week', TZ, now)).toEqual({
      from: '2026-09-14', to: '2026-09-20', prevFrom: '2026-09-07', prevTo: '2026-09-13'
    });
  });

  it('calcula el mes actual y el anterior', () => {
    const now = new Date('2026-09-15T15:00:00Z');
    expect(periodRange('this_month', TZ, now)).toEqual({
      from: '2026-09-01', to: '2026-09-30', prevFrom: '2026-08-01', prevTo: '2026-08-31'
    });
  });
});
