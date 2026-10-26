import { describe, expect, it } from 'vitest';
import {
  analyse,
  cycleDayOf,
  futureCycleDay,
  mainPhase,
  periods,
  phaseOf,
  predictions,
} from '../../src/lib/cycle.ts';
import { addDays } from '../../src/lib/dates.ts';

// Period days: `length` days from each start.
const log = (starts: string[], length = 5) =>
  starts.flatMap((s) => Array.from({ length }, (_, i) => addDays(s, i)));

describe('periods', () => {
  it('keeps a period together across one forgotten day, and splits on longer gaps', () => {
    expect(periods(['2026-10-01', '2026-10-02', '2026-10-04'])).toEqual([
      { start: '2026-10-01', end: '2026-10-04' },
    ]);
    expect(periods(['2026-10-01', '2026-10-04'])).toEqual([
      { start: '2026-10-01', end: '2026-10-01' },
      { start: '2026-10-04', end: '2026-10-04' },
    ]);
  });
});

describe('analyse', () => {
  it('uses 28/5-day defaults before two periods are logged', () => {
    const a = analyse(['2026-10-10', '2026-10-11'], '2026-10-20');
    expect(a).toMatchObject({ cycleLen: 28, periodLen: 2, sample: 0, nextStart: '2026-11-07' });
    expect(analyse([], '2026-10-20')).toMatchObject({
      last: null,
      nextStart: null,
      cycleLen: 28,
      periodLen: 5,
    });
  });

  it('averages the last 6 plausible cycles and ignores logging gaps', () => {
    // Cycles: 30, 26, 90 (missed logging), 28, 28 → averages 30, 26, 28, 28 = 28.
    const a = analyse(
      log(['2026-01-01', '2026-01-31', '2026-02-26', '2026-05-27', '2026-06-24', '2026-07-22']),
      '2026-08-01',
    );
    expect(a.cycles).toEqual([30, 26, 90, 28, 28]);
    expect(a).toMatchObject({ cycleLen: 28, periodLen: 5, sample: 4, nextStart: '2026-08-19' });
  });

  it('rolls the prediction forward when it is more than a cycle overdue', () => {
    const a = analyse(log(['2026-01-01', '2026-01-29']), '2026-04-01');
    expect(a.nextStart).toBe('2026-03-26'); // 26 Feb is more than 28 days ago
  });
});

describe('predictions', () => {
  it('marks predicted periods, ovulation 14 days before them and a 7-day fertile window', () => {
    const days = log(['2026-09-02', '2026-09-30'], 4);
    const p = predictions(analyse(days, '2026-10-20'), days);
    expect(p.predicted.has('2026-10-28')).toBe(true);
    expect(p.predicted.has('2026-10-31')).toBe(true);
    expect(p.predicted.has('2026-11-01')).toBe(false); // 4-day periods
    expect(p.ovulation.has('2026-10-14')).toBe(true);
    for (const d of ['2026-10-09', '2026-10-15']) expect(p.fertile.has(d)).toBe(true);
    for (const d of ['2026-10-08', '2026-10-16']) expect(p.fertile.has(d)).toBe(false);
  });
});

describe('cycle days and phases', () => {
  const a = { cycleLen: 28, periodLen: 5 };

  it('splits a 28-day cycle into phases', () => {
    const phases = Array.from({ length: 30 }, (_, i) => phaseOf(i + 1, a));
    expect(phases.slice(0, 5)).toEqual(Array(5).fill('period'));
    expect(phases.slice(5, 11)).toEqual(Array(6).fill('follicular'));
    expect(phases.slice(11, 16)).toEqual(Array(5).fill('ovulation'));
    expect(phases.slice(16, 21)).toEqual(Array(5).fill('luteal'));
    expect(phases.slice(21)).toEqual(Array(9).fill('premenstrual')); // includes days of a late period
  });

  it('counts cycle days from the latest period start', () => {
    const ps = periods(log(['2026-09-02', '2026-09-30']));
    expect(cycleDayOf('2026-09-01', ps)).toBeNull();
    expect(cycleDayOf('2026-09-29', ps)).toBe(28);
    expect(cycleDayOf('2026-10-20', ps)).toBe(21);
  });

  it('predicts cycle days in future cycles', () => {
    const analysis = analyse(log(['2026-09-02', '2026-09-30']), '2026-10-20');
    expect(futureCycleDay('2026-10-28', analysis)).toBe(1);
    expect(futureCycleDay('2026-11-03', analysis)).toBe(7);
  });

  it('finds the phase most days fall in, only when it holds at least half', () => {
    const analysis = analyse(log(['2026-09-02', '2026-09-30']), '2026-10-20');
    expect(mainPhase(['2026-10-24', '2026-10-25', '2026-10-01'], analysis)?.id).toBe('premenstrual');
    expect(mainPhase(['2026-10-24', '2026-10-01', '2026-10-08'], analysis)).toBeNull();
  });
});
