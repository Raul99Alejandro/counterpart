export type Period = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Fecha civil (YYYY-MM-DD) en la zona del negocio. */
export function businessToday(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

/** Índice de día de la semana (0 = domingo) en la zona del negocio. */
function weekdayIndex(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

export function shiftDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fecha civil que además existe en el calendario. La forma no basta: "2026-02-30" pasa
 * cualquier expresión regular y Date lo corre a marzo, así que se valida yendo y volviendo.
 */
function calendarDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** Resuelve "today", "tomorrow", un día de la semana o YYYY-MM-DD. Devuelve null si no entiende. */
export function resolveDue(input: string, timezone: string, now: Date): string | null {
  const value = input.trim().toLowerCase();
  const today = businessToday(timezone, now);

  if (value === 'today') return today;
  if (value === 'tomorrow') return shiftDays(today, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return calendarDate(value);

  const target = WEEKDAYS.indexOf(value);
  if (target >= 0) {
    const delta = (target - weekdayIndex(today) + 7) % 7;
    return shiftDays(today, delta);
  }
  return null;
}

/** Todas las fechas civiles de `from` a `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftDays(d, 1)) out.push(d);
  return out;
}

function previousMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const dayOf = (ym: string, day: number): string => `${ym}-${String(day).padStart(2, '0')}`;

/**
 * Rangos inclusivos del periodo y del periodo anterior. Semanas de lunes a domingo. Los periodos en
 * curso (`this_week`, `this_month`) van hasta hoy y se comparan contra los mismos días del periodo
 * anterior (spec B2 §5.5.6, que cambia el §7.4 del spec base).
 */
export function periodRange(period: Period, timezone: string, now: Date): {
  from: string; to: string; prevFrom: string; prevTo: string;
} {
  const today = businessToday(timezone, now);
  const mondayOffset = (weekdayIndex(today) + 6) % 7;

  switch (period) {
    case 'today':
      return { from: today, to: today, prevFrom: shiftDays(today, -1), prevTo: shiftDays(today, -1) };
    case 'yesterday': {
      const y = shiftDays(today, -1);
      return { from: y, to: y, prevFrom: shiftDays(y, -1), prevTo: shiftDays(y, -1) };
    }
    case 'this_week': {
      const from = shiftDays(today, -mondayOffset);
      return { from, to: today, prevFrom: shiftDays(from, -7), prevTo: shiftDays(today, -7) };
    }
    case 'last_week': {
      const from = shiftDays(today, -mondayOffset - 7);
      return { from, to: shiftDays(from, 6), prevFrom: shiftDays(from, -7), prevTo: shiftDays(from, -1) };
    }
    case 'this_month': {
      const ym = today.slice(0, 7);
      const prev = previousMonth(ym);
      const day = Number(today.slice(8));
      return { from: dayOf(ym, 1), to: today, prevFrom: dayOf(prev, 1), prevTo: dayOf(prev, Math.min(day, daysInMonth(prev))) };
    }
    case 'last_month': {
      const ym = previousMonth(today.slice(0, 7));
      const prev = previousMonth(ym);
      return { from: dayOf(ym, 1), to: dayOf(ym, daysInMonth(ym)), prevFrom: dayOf(prev, 1), prevTo: dayOf(prev, daysInMonth(prev)) };
    }
  }
}
