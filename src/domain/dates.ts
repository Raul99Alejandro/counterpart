export type Period = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Calendar date (YYYY-MM-DD) in the business's time zone. */
export function businessToday(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

/** Day-of-week index (0 = Sunday) in the business's time zone. */
function weekdayIndex(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

export function shiftDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Calendar date that also exists on the calendar. The shape is not enough: "2026-02-30" passes
 * any regular expression and Date rolls it into March, so it is validated with a round trip.
 */
function calendarDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** Resolves "today", "tomorrow", a weekday or YYYY-MM-DD. Returns null if it cannot parse it. */
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

/** Every calendar date from `from` to `to`, inclusive. */
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
 * Inclusive ranges for the period and the previous period. Weeks run Monday to Sunday. Periods in
 * progress (`this_week`, `this_month`) run up to today and are compared against the same days of the
 * previous period (spec B2 §5.5.6, which changes §7.4 of the base spec).
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
