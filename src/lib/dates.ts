// Calendar dates as 'YYYY-MM-DD' strings. All maths runs in UTC on these strings, so
// daylight-saving changes and time zones never shift a day.

import type { IsoDate } from './types.ts';

export const DAY_MS = 86400000;

/** Today's date in the device's own time zone. */
export function todayIso(now = new Date()): IsoDate {
  return toIso(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function toIso(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function toMs(iso: IsoDate): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  return toIso(toMs(iso) + n * DAY_MS);
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}

export function startOfMonth(iso: IsoDate): IsoDate {
  return iso.slice(0, 8) + '01';
}

/** The 1st of the month n months after the month of `iso`. */
export function addMonths(iso: IsoDate, n: number): IsoDate {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  return toIso(Date.UTC(y, m - 1 + n, 1));
}

/** Every date in the `months` calendar months starting at `from` (a 1st of the month). */
export function daysBetween(from: IsoDate, months: number): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from, to = addMonths(from, months); d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: IsoDate): number {
  return (new Date(toMs(iso)).getUTCDay() + 6) % 7;
}

export function isIsoDate(d: unknown): d is IsoDate {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(toMs(d));
}

/** Format a date for display in the device's language, e.g. 'Oct 20'. */
export function fmt(
  iso: IsoDate,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
): string {
  return new Date(toMs(iso)).toLocaleDateString(undefined, { timeZone: 'UTC', ...opts });
}
