// Periods, cycle averages, predictions and cycle phases, worked out from logged period days.

import {
  DEFAULT_CYCLE,
  DEFAULT_PERIOD,
  HISTORY_WINDOW,
  LUTEAL_PHASE,
  MAX_CYCLE,
  MIN_CYCLE,
  PHASES,
} from './catalog.ts';
import { addDays, diffDays } from './dates.ts';
import type { Analysis, IsoDate, Period, Phase, PhaseId } from './types.ts';

/** Group sorted period days into periods. A one-day gap (forgot to log) stays in the same period. */
export function periods(days: IsoDate[]): Period[] {
  const out: Period[] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && diffDays(last.end, d) <= 2) last.end = d;
    else out.push({ start: d, end: d });
  }
  return out;
}

/** Rounded average, or `fallback` when there's nothing to average. */
export function average(nums: number[], fallback: number): number {
  if (!nums.length) return fallback;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Cycle lengths worth averaging: plausible ones (15–60 days), the most recent 6. */
export function usableCycles(cycles: number[]): number[] {
  return cycles.filter((c) => c >= MIN_CYCLE && c <= MAX_CYCLE).slice(-HISTORY_WINDOW);
}

export function analyse(days: IsoDate[], today: IsoDate): Analysis {
  const ps = periods(days);
  const cycles: number[] = [];
  for (let i = 1; i < ps.length; i++) cycles.push(diffDays(ps[i - 1]!.start, ps[i]!.start));
  const usable = usableCycles(cycles);
  const cycleLen = average(usable, DEFAULT_CYCLE);
  const periodLen = average(
    ps.slice(-HISTORY_WINDOW).map((p) => diffDays(p.start, p.end) + 1),
    DEFAULT_PERIOD,
  );
  const last = ps[ps.length - 1] ?? null;

  let nextStart: IsoDate | null = null;
  if (last) {
    nextStart = addDays(last.start, cycleLen);
    // If the predicted date is long past, roll forward so predictions stay useful.
    while (diffDays(nextStart, today) > cycleLen) nextStart = addDays(nextStart, cycleLen);
  }
  return { ps, cycles, cycleLen, periodLen, last, nextStart, sample: usable.length };
}

/** Predicted period, fertile and ovulation days for the next few cycles. */
export function predictions(a: Analysis, days: IsoDate[]) {
  const predicted = new Set<IsoDate>();
  const fertile = new Set<IsoDate>();
  const ovulation = new Set<IsoDate>();
  if (!a.last) return { predicted, fertile, ovulation };
  const marked = new Set(days);
  for (let k = 0; k <= 6; k++) {
    const start = addDays(a.last.start, a.cycleLen * k);
    if (k > 0) {
      for (let i = 0; i < a.periodLen; i++) {
        const d = addDays(start, i);
        if (!marked.has(d)) predicted.add(d);
      }
    }
    // Ovulation ~14 days before the next period; fertile from 5 days before to the day after.
    const ov = addDays(start, a.cycleLen - LUTEAL_PHASE);
    ovulation.add(ov);
    for (let i = -5; i <= 1; i++) fertile.add(addDays(ov, i));
  }
  return { predicted, fertile, ovulation };
}

/** Cycle day (1-based) of a past date, counted from the latest period start on or before it. */
export function cycleDayOf(iso: IsoDate, ps: Period[]): number | null {
  let start: IsoDate | null = null;
  for (const p of ps) {
    if (p.start <= iso) start = p.start;
    else break;
  }
  return start ? diffDays(start, iso) + 1 : null;
}

/** Predicted cycle day for a date on or after the last period start. */
export function futureCycleDay(d: IsoDate, a: Analysis): number {
  const L = a.cycleLen;
  return (((diffDays(a.last!.start, d) % L) + L) % L) + 1;
}

/** Which part of the cycle a cycle day falls in, using the average cycle and period length. */
export function phaseOf(cd: number, a: Pick<Analysis, 'cycleLen' | 'periodLen'>): PhaseId {
  const L = a.cycleLen;
  const ov = L - LUTEAL_PHASE;
  if (cd <= a.periodLen) return 'period';
  if (cd > L - 7) return 'premenstrual'; // also covers days past a late period
  if (Math.abs(cd - ov) <= 2) return 'ovulation';
  return cd < ov ? 'follicular' : 'luteal';
}

export const PHASE_BY_ID = Object.fromEntries(PHASES.map((p) => [p.id, p])) as Record<PhaseId, Phase>;

/** The phase most of `days` fall in, if one clearly dominates (at least half of them). */
export function mainPhase(days: IsoDate[], a: Analysis): Phase | null {
  if (!a.last || days.length < 2) return null;
  const count: Partial<Record<PhaseId, number>> = {};
  for (const d of days) {
    const cd = cycleDayOf(d, a.ps);
    if (cd) {
      const ph = phaseOf(cd, a);
      count[ph] = (count[ph] ?? 0) + 1;
    }
  }
  const best = PHASES.map((p) => ({ p, n: count[p.id] ?? 0 })).sort((x, y) => y.n - x.n)[0]!;
  return best.n >= 2 && best.n >= days.length / 2 ? best.p : null;
}
