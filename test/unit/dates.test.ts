import { describe, expect, it } from 'vitest';
import { businessToday, datesBetween, periodRange, resolveDue } from '../../src/domain/dates.js';

const TZ = 'America/Chicago';

describe('dates', () => {
  it('uses the business time zone, not the server one', () => {
    // 2026-09-15T02:30:00Z is still September 14 in Chicago
    expect(businessToday(TZ, new Date('2026-09-15T02:30:00Z'))).toBe('2026-09-14');
  });

  it('resolves today and tomorrow', () => {
    const now = new Date('2026-09-15T15:00:00Z'); // Tuesday the 15th in Chicago
    expect(resolveDue('today', TZ, now)).toBe('2026-09-15');
    expect(resolveDue('tomorrow', TZ, now)).toBe('2026-09-16');
  });

  it('resolves the next day of the week, including today', () => {
    const now = new Date('2026-09-15T15:00:00Z'); // Tuesday
    expect(resolveDue('saturday', TZ, now)).toBe('2026-09-19');
    expect(resolveDue('tuesday', TZ, now)).toBe('2026-09-15');
  });

  it('accepts an explicit date and rejects garbage', () => {
    const now = new Date('2026-09-15T15:00:00Z');
    expect(resolveDue('2026-12-24', TZ, now)).toBe('2026-12-24');
    expect(resolveDue('whenever', TZ, now)).toBeNull();
  });

  it('rejects well-formed dates that do not exist on the calendar', () => {
    const now = new Date('2026-09-15T15:00:00Z');
    // Accepting them saved the order and then crashed when saying the date out loud.
    expect(resolveDue('2026-13-45', TZ, now)).toBeNull();
    expect(resolveDue('2026-02-30', TZ, now)).toBeNull();
    expect(resolveDue('2026-09-31', TZ, now)).toBeNull();
    expect(resolveDue('2026-02-28', TZ, now)).toBe('2026-02-28');
    expect(resolveDue('2028-02-29', TZ, now)).toBe('2028-02-29');
  });

  it('computes the current week from Monday to today against the same days of the previous one', () => {
    const now = new Date('2026-09-15T15:00:00Z'); // Tuesday
    expect(periodRange('this_week', TZ, now)).toEqual({
      from: '2026-09-14', to: '2026-09-15', prevFrom: '2026-09-07', prevTo: '2026-09-08'
    });
  });

  it('computes the current month up to today against the same days of the previous one', () => {
    const now = new Date('2026-09-15T15:00:00Z');
    expect(periodRange('this_month', TZ, now)).toEqual({
      from: '2026-09-01', to: '2026-09-15', prevFrom: '2026-08-01', prevTo: '2026-08-15'
    });
  });
});

describe('periods that compare equivalent days (spec B2 §5.5.6)', () => {
  const wednesday = new Date('2026-09-16T17:00:00Z'); // Wednesday in Chicago

  it('this_week runs from Monday to today against the same days of last week', () => {
    expect(periodRange('this_week', 'America/Chicago', wednesday))
      .toEqual({ from: '2026-09-14', to: '2026-09-16', prevFrom: '2026-09-07', prevTo: '2026-09-09' });
  });

  it('last_week still compares full weeks', () => {
    expect(periodRange('last_week', 'America/Chicago', wednesday))
      .toEqual({ from: '2026-09-07', to: '2026-09-13', prevFrom: '2026-08-31', prevTo: '2026-09-06' });
  });

  it('this_month runs from the 1st to today against the same days of last month, without going past its end', () => {
    expect(periodRange('this_month', 'America/Chicago', wednesday))
      .toEqual({ from: '2026-09-01', to: '2026-09-16', prevFrom: '2026-08-01', prevTo: '2026-08-16' });
    expect(periodRange('this_month', 'America/Chicago', new Date('2026-03-30T17:00:00Z')))
      .toEqual({ from: '2026-03-01', to: '2026-03-30', prevFrom: '2026-02-01', prevTo: '2026-02-28' });
  });

  it('datesBetween includes both ends', () => {
    expect(datesBetween('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
});
