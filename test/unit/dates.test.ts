import { describe, expect, it } from 'vitest';
import { businessToday, datesBetween, periodRange, resolveDue } from '../../src/domain/dates.js';

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

  it('rechaza fechas con forma válida pero que no existen en el calendario', () => {
    const now = new Date('2026-09-15T15:00:00Z');
    // Aceptarlas persistía la orden y luego reventaba al decir la fecha en voz alta.
    expect(resolveDue('2026-13-45', TZ, now)).toBeNull();
    expect(resolveDue('2026-02-30', TZ, now)).toBeNull();
    expect(resolveDue('2026-09-31', TZ, now)).toBeNull();
    expect(resolveDue('2026-02-28', TZ, now)).toBe('2026-02-28');
    expect(resolveDue('2028-02-29', TZ, now)).toBe('2028-02-29');
  });

  it('calcula la semana en curso de lunes a hoy contra los mismos días de la anterior', () => {
    const now = new Date('2026-09-15T15:00:00Z'); // martes
    expect(periodRange('this_week', TZ, now)).toEqual({
      from: '2026-09-14', to: '2026-09-15', prevFrom: '2026-09-07', prevTo: '2026-09-08'
    });
  });

  it('calcula el mes en curso hasta hoy contra los mismos días del anterior', () => {
    const now = new Date('2026-09-15T15:00:00Z');
    expect(periodRange('this_month', TZ, now)).toEqual({
      from: '2026-09-01', to: '2026-09-15', prevFrom: '2026-08-01', prevTo: '2026-08-15'
    });
  });
});

describe('periodos que comparan días equivalentes (spec B2 §5.5.6)', () => {
  const wednesday = new Date('2026-09-16T17:00:00Z'); // miércoles en Chicago

  it('this_week va de lunes a hoy contra los mismos días de la semana pasada', () => {
    expect(periodRange('this_week', 'America/Chicago', wednesday))
      .toEqual({ from: '2026-09-14', to: '2026-09-16', prevFrom: '2026-09-07', prevTo: '2026-09-09' });
  });

  it('last_week sigue comparando semanas completas', () => {
    expect(periodRange('last_week', 'America/Chicago', wednesday))
      .toEqual({ from: '2026-09-07', to: '2026-09-13', prevFrom: '2026-08-31', prevTo: '2026-09-06' });
  });

  it('this_month va del 1 a hoy contra los mismos días del mes pasado, sin pasarse de su fin', () => {
    expect(periodRange('this_month', 'America/Chicago', wednesday))
      .toEqual({ from: '2026-09-01', to: '2026-09-16', prevFrom: '2026-08-01', prevTo: '2026-08-16' });
    expect(periodRange('this_month', 'America/Chicago', new Date('2026-03-30T17:00:00Z')))
      .toEqual({ from: '2026-03-01', to: '2026-03-30', prevFrom: '2026-02-01', prevTo: '2026-02-28' });
  });

  it('datesBetween incluye los dos extremos', () => {
    expect(datesBetween('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
});
