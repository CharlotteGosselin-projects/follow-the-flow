// The monthly recap: what a month looked like, and how it compares with the one before.

import {
  DEFAULT_CYCLE,
  GOOD_MOODS,
  MOODS,
  RECAP_COMPARE_DAYS,
  RECAP_MIN_MOOD_DAYS,
  TOUGH_MOODS,
} from './catalog.ts';
import { average, usableCycles } from './cycle.ts';
import { addDays, addMonths, diffDays, fmt } from './dates.ts';
import { pct, plural } from './text.ts';
import type { Analysis, IsoDate, MoodId, Period, State } from './types.ts';

export interface MonthStats {
  /** The 1st of the month. */
  month: IsoDate;
  /** Days counted (up to today). */
  days: number;
  complete: boolean;
  moodDays: IsoDate[];
  moodCount: Partial<Record<MoodId, number>>;
  good: IsoDate[];
  tough: IsoDate[];
  /** Nights since sleep tracking started (the first bad night ever logged). */
  sleepNights: number;
  bad: IsoDate[];
  insomnia: number;
  /** Days since habit logging started, and days with habits logged. */
  habitTracked: number;
  habitDays: number;
  habitCount: Record<string, number>;
  /** Periods that started this month, with their index in the analysis. */
  periods: (Period & { i: number })[];
}

/** Everything logged in one calendar month, up to today. */
export function monthStats(state: State, a: Analysis, month: IsoDate, today: IsoDate): MonthStats {
  const end = addDays(addMonths(month, 1), -1);
  const last = end < today ? end : today;
  const days: IsoDate[] = [];
  for (let d = month; d <= last; d = addDays(d, 1)) days.push(d);

  const moodDays = days.filter((d) => state.moods[d]);
  const moodCount: Partial<Record<MoodId, number>> = {};
  for (const d of moodDays) for (const m of state.moods[d]!) moodCount[m] = (moodCount[m] ?? 0) + 1;
  const has = (d: IsoDate, ids: MoodId[]) => state.moods[d]!.some((m) => ids.includes(m));
  const good = moodDays.filter((d) => has(d, GOOD_MOODS) && !has(d, TOUGH_MOODS));
  const tough = moodDays.filter((d) => has(d, TOUGH_MOODS) && !has(d, GOOD_MOODS));

  const firstSleep = Object.keys(state.sleep).sort()[0];
  const bad = days.filter((d) => state.sleep[d]);

  // Sick days count only once habit logging has started, so the comparison is fair.
  const firstHabit = Object.keys(state.habits).sort()[0];
  const habitDays = days.filter((d) => state.habits[d]);
  const habitCount: Record<string, number> = {};
  for (const d of habitDays)
    for (const id of Object.keys(state.habits[d]!)) habitCount[id] = (habitCount[id] ?? 0) + 1;

  return {
    month,
    days: days.length,
    complete: end < today,
    moodDays,
    moodCount,
    good,
    tough,
    sleepNights: firstSleep ? days.filter((d) => d >= firstSleep).length : 0,
    bad,
    insomnia: bad.filter((d) => state.sleep[d] === 'insomnia').length,
    habitTracked: firstHabit ? days.filter((d) => d >= firstHabit).length : 0,
    habitDays: habitDays.length,
    habitCount,
    periods: a.ps.map((p, i) => ({ ...p, i })).filter((p) => p.start >= month && p.start <= last),
  };
}

export type Tone = 'good' | 'mixed' | 'tough';

/** From the balance of good and tough mood days; null with too few mood days. */
export function monthTone(s: MonthStats): Tone | null {
  if (s.moodDays.length < RECAP_MIN_MOOD_DAYS) return null;
  const balance = (s.good.length - s.tough.length) / s.moodDays.length;
  return balance >= 0.3 ? 'good' : balance <= -0.3 ? 'tough' : 'mixed';
}

export interface PeriodRecap {
  start: IsoDate;
  length: number;
  ongoing: boolean;
  /** The cycle that ended with this period, and the average of the cycles before it. */
  cycle: number | null;
  avg: number | null;
  /** Days later (> 0) or earlier (< 0) than that average predicted. */
  shift: number | null;
}

/** How a period start compared with what its own past cycles predicted. */
export function periodRecap(p: Period & { i: number }, a: Analysis, today: IsoDate): PeriodRecap {
  const out: PeriodRecap = {
    start: p.start,
    length: diffDays(p.start, p.end) + 1,
    ongoing: p.end >= addDays(today, -1) && p.i === a.ps.length - 1,
    cycle: null,
    avg: null,
    shift: null,
  };
  if (p.i > 0) {
    out.cycle = diffDays(a.ps[p.i - 1]!.start, p.start);
    const before = usableCycles(a.cycles.slice(0, p.i - 1));
    if (before.length && usableCycles([out.cycle]).length) {
      out.avg = average(before, DEFAULT_CYCLE);
      out.shift = out.cycle - out.avg;
    }
  }
  return out;
}

/** Short lines comparing a month with the one before it. */
export function compareMonths(s: MonthStats, prev: MonthStats): string[] {
  const lines: string[] = [];
  const name = fmt(prev.month, { month: 'long' });
  const soFar = s.complete ? '' : ' so far';
  if (s.moodDays.length >= RECAP_COMPARE_DAYS && prev.moodDays.length >= RECAP_COMPARE_DAYS) {
    const share = (st: MonthStats, id: MoodId) => (st.moodCount[id] ?? 0) / st.moodDays.length;
    const changes = MOODS.map((m) => ({ m, now: share(s, m.id), before: share(prev, m.id) }))
      .filter((c) => Math.abs(c.now - c.before) >= 0.15)
      .sort((x, y) => Math.abs(y.now - y.before) - Math.abs(x.now - x.before))
      .slice(0, 2);
    for (const c of changes) {
      lines.push(
        `${c.m.emoji} ${c.now > c.before ? 'More' : 'Fewer'} ${c.m.label.toLowerCase()} days than in ${name}${soFar} ` +
          `(${pct(c.now)}% of logged days vs ${pct(c.before)}%).`,
      );
    }
  }
  // Rates per night, so a month that is still going compares fairly.
  if (s.sleepNights >= 7 && prev.sleepNights >= 7) {
    const now = s.bad.length / s.sleepNights;
    const before = prev.bad.length / prev.sleepNights;
    if (Math.abs(now - before) >= 0.1) {
      lines.push(
        `${now < before ? '😴 Slept better' : '🦉 Slept worse'} than in ${name}${soFar} ` +
          `(${plural(s.bad.length, 'bad night')} in ${s.sleepNights} vs ${prev.bad.length} in ${prev.sleepNights}).`,
      );
    }
  }
  if (s.habitTracked >= 7 && prev.habitTracked >= 7) {
    const now = s.habitCount.sick ?? 0;
    const before = prev.habitCount.sick ?? 0;
    if (now !== before && (now >= 2 || before >= 2)) {
      lines.push(
        `🤒 ${now > before ? 'More' : 'Fewer'} sick days than in ${name}${soFar} (${now} vs ${before}).`,
      );
    }
  }
  return lines;
}
