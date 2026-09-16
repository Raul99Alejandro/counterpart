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

/** Resuelve "today", "tomorrow", un día de la semana o YYYY-MM-DD. Devuelve null si no entiende. */
export function resolveDue(input: string, timezone: string, now: Date): string | null {
  const value = input.trim().toLowerCase();
  const today = businessToday(timezone, now);

  if (value === 'today') return today;
  if (value === 'tomorrow') return shiftDays(today, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const target = WEEKDAYS.indexOf(value);
  if (target >= 0) {
    const delta = (target - weekdayIndex(today) + 7) % 7;
    return shiftDays(today, delta);
  }
  return null;
}

/** Rangos inclusivos del periodo y del periodo anterior. Semanas de lunes a domingo. */
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
      return { from, to: shiftDays(from, 6), prevFrom: shiftDays(from, -7), prevTo: shiftDays(from, -1) };
    }
    case 'last_week': {
      const from = shiftDays(today, -mondayOffset - 7);
      return { from, to: shiftDays(from, 6), prevFrom: shiftDays(from, -7), prevTo: shiftDays(from, -1) };
    }
    case 'this_month':
      return monthRange(today.slice(0, 7));
    case 'last_month': {
      const [y, m] = today.split('-').map(Number) as [number, number];
      const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
      return monthRange(prev);
    }
  }
}

function monthRange(ym: string): { from: string; to: string; prevFrom: string; prevTo: string } {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const from = `${ym}-01`;
  const to = `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const prevYm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const [py, pm] = prevYm.split('-').map(Number) as [number, number];
  return {
    from, to,
    prevFrom: `${prevYm}-01`,
    prevTo: `${prevYm}-${String(new Date(Date.UTC(py, pm, 0)).getUTCDate()).padStart(2, '0')}`
  };
}
