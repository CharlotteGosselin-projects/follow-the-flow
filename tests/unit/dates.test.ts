import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  diffDays,
  isIsoDate,
  startOfMonth,
  todayIso,
  weekdayIndex,
} from '../../src/lib/dates.ts';

describe('dates', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days, unaffected by daylight-saving changes', () => {
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2); // EU clocks change on 29 March
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
    expect(diffDays('2026-10-20', '2026-10-01')).toBe(-19);
  });

  it('moves by calendar months to the 1st', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
    expect(startOfMonth('2026-10-20')).toBe('2026-10-01');
  });

  it('lists every day of a range of months', () => {
    expect(daysBetween('2026-02-01', 1)).toHaveLength(28);
    expect(daysBetween('2026-01-01', 12)).toHaveLength(365);
  });

  it('takes today from the local date, not UTC', () => {
    expect(todayIso(new Date(2026, 9, 20, 23, 59))).toBe('2026-10-20');
    expect(todayIso(new Date(2026, 9, 21, 0, 1))).toBe('2026-10-21');
  });

  it('numbers weekdays from Monday', () => {
    expect(weekdayIndex('2024-01-01')).toBe(0); // a Monday
    expect(weekdayIndex('2026-10-25')).toBe(6); // a Sunday
  });

  it('validates ISO dates', () => {
    expect(isIsoDate('2026-10-20')).toBe(true);
    expect(isIsoDate('2026-1-2')).toBe(false);
    expect(isIsoDate(20261020)).toBe(false);
  });
});
