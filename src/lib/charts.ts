// Data behind the recap chart (one value per day or per month) and the recap insights.

import { INSIGHT_MIN_DAYS, RECAP_CHARTS, RECAP_INSIGHTS, TOUGH_MOODS, type ChartDef } from './catalog.ts';
import { mainPhase } from './cycle.ts';
import { addDays, addMonths, daysBetween, fmt, weekdayIndex } from './dates.ts';
import { allHabits } from './habits.ts';
import { pct, plural, shortList } from './text.ts';
import type { Analysis, Habit, IsoDate, State } from './types.ts';

export type Range = 'month' | 'year';

/** The days a chart covers: the shown month, or that month's whole year. */
export function rangeDays(range: Range, viewMonth: IsoDate): IsoDate[] {
  return range === 'year' ? daysBetween(viewMonth.slice(0, 5) + '01-01', 12) : daysBetween(viewMonth, 1);
}

/**
 * Whether anything was logged for a day: habits, a mood or a bad night. If so, a habit left
 * untapped that day counts as "none". Period days alone don't count, since they're often
 * filled in afterwards without logging anything else.
 */
export function usedApp(state: State, d: IsoDate): boolean {
  return !!(state.habits[d] || state.moods[d] || state.sleep[d]);
}

/** One line of the chart. */
export interface Series {
  key: string;
  emoji: string;
  title: string;
  /** Names of levels 1..n, used for the day view's labels and scale. */
  levels: string[];
  /** For count habits (drinks, cups): the unit totals add up in. */
  amount: string | null;
  heavy?: Habit['heavy'];
  /** A number for a logged day (0 = logged, not this habit), null for nothing logged. */
  value: (d: IsoDate) => number | null;
  /** e.g. '6 drinks', '3 days', '2 bad nights'. */
  total: (n: number) => string;
}

export function chartSeries(def: ChartDef, state: State, today: IsoDate): Series | null {
  if ('sleep' in def) {
    // Sleep tracking starts at the first bad night ever logged; later unlogged nights are fine.
    const first = Object.keys(state.sleep).sort()[0];
    return {
      key: 'sleep',
      emoji: '🌙',
      title: 'Bad nights',
      levels: ['poor sleep', 'insomnia'],
      amount: null,
      value: (d) => {
        if (!first || d < first || d > today) return null;
        return state.sleep[d] === 'insomnia' ? 2 : state.sleep[d] ? 1 : 0;
      },
      total: (n) => plural(n, 'bad night'),
    };
  }
  const h = allHabits(state).find((x) => x.id === def.habit);
  if (!h || state.hiddenHabits.includes(h.id)) return null;
  return {
    key: h.id,
    emoji: h.emoji,
    title: h.label,
    levels: h.levels ?? ['yes'],
    amount: def.amount ?? null,
    heavy: h.heavy,
    value: (d) => (d <= today && usedApp(state, d) ? (state.habits[d]?.[h.id] ?? 0) : null),
    total: (n) => plural(n, def.amount ?? 'day'),
  };
}

/** Text for one day's value, e.g. '2 drinks', 'a lot', 'none', 'not logged'. */
export function levelText(s: Series, v: number | null): string {
  if (v == null) return 'not logged';
  if (!v) return 'none';
  return s.key === 'sick' ? 'sick' : (s.levels[v - 1] ?? String(v));
}

export interface Totals {
  /** Days with anything logged, days with this habit, its total, and heavy days. */
  logged: number;
  hit: number;
  sum: number;
  heavy: number;
}

/** Totals over some days. Count habits add up their levels (5+ counts as 5); others count days. */
export function chartTotals(s: Series, days: IsoDate[]): Totals {
  let logged = 0;
  let hit = 0;
  let sum = 0;
  let heavy = 0;
  for (const d of days) {
    const v = s.value(d);
    if (v == null) continue;
    logged++;
    if (v) {
      hit++;
      sum += v;
      if (s.heavy && v >= s.heavy.level) heavy++;
    }
  }
  return { logged, hit, sum: s.amount ? sum : hit, heavy };
}

/** Round a chart's top value up to 5, 10, 20, 50, 100… */
export function niceMax(v: number): number {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((k) => k * p).find((n) => n >= v)!;
}

/**
 * Plain-language findings for the charted range. Simple counts over this range, so they
 * describe what happened rather than prove a cause.
 */
export function recapInsights(
  state: State,
  a: Analysis,
  range: Range,
  viewMonth: IsoDate,
  today: IsoDate,
): string[] {
  const days = rangeDays(range, viewMonth).filter((d) => d <= today);
  const out: string[] = [];
  for (const id of RECAP_INSIGHTS) {
    const def = RECAP_CHARTS.find((x) => 'habit' in x && x.habit === id)!;
    const c = chartSeries(def, state, today);
    if (!c) continue;
    const logged = days.filter((d) => c.value(d) != null);
    const hitDays = logged.filter((d) => c.value(d)! > 0);
    if (!hitDays.length) continue;
    const name = c.title.toLowerCase();

    // Compared with the months before (month view only).
    if (range === 'month' && logged.length >= 7) {
      const past: number[] = [];
      for (let k = 1; k <= 6; k++) {
        const t = chartTotals(c, daysBetween(addMonths(viewMonth, -k), 1));
        if (t.logged >= 10) past.push(t.hit / t.logged);
      }
      if (past.length >= 2) {
        const usual = past.reduce((x, y) => x + y, 0) / past.length;
        const now = hitDays.length / logged.length;
        if (Math.abs(now - usual) >= 0.1 && (now >= 1.5 * usual || now <= usual / 1.5)) {
          out.push(
            `${c.emoji} ${now > usual ? 'More' : 'Less'} ${name} than usual: ${pct(now)}% of logged days vs ${pct(usual)}% in your previous months.`,
          );
        }
      }
    }
    // Heavy days (3+ drinks, 3+ cups, a lot of meetings).
    const heavyText = c.heavy && (c.amount ? c.heavy.label : `${name} ${c.heavy.label}`);
    if (c.heavy) {
      const heavy = hitDays.filter((d) => c.value(d)! >= c.heavy!.level).length;
      if (heavy) out.push(`${c.emoji} ${plural(heavy, 'day')} with ${heavyText}.`);
    }
    // Days of the week.
    if (hitDays.length >= 5) {
      const byDay = Array<number>(7).fill(0);
      for (const d of hitDays) byDay[weekdayIndex(d)]!++;
      const top = byDay.map((n, i) => ({ n, i })).sort((x, y) => y.n - x.n);
      const share = (top[0]!.n + top[1]!.n) / hitDays.length;
      if (share >= 0.6) {
        // 2024-01-01 was a Monday.
        const names = top
          .slice(0, 2)
          .sort((x, y) => x.i - y.i)
          .map((t) => fmt(addDays('2024-01-01', t.i), { weekday: 'long' }) + 's');
        out.push(
          `${c.emoji} ${c.title} mostly on ${shortList(names)} (${pct(share)}% of ${plural(hitDays.length, 'day')}).`,
        );
      }
    }
    // Part of the cycle.
    const ph = hitDays.length >= 6 && mainPhase(hitDays, a);
    if (ph) out.push(`${c.emoji} ${c.title} days were mostly ${ph.when}.`);

    // Mood the same day and sleep the night after, with vs without (or heavy vs not).
    const isHit = c.heavy ? (d: IsoDate) => c.value(d)! >= c.heavy!.level : (d: IsoDate) => c.value(d)! > 0;
    const what = c.heavy ? `days with ${heavyText}` : `${name} days`;
    const moodDays = logged.filter((d) => state.moods[d]);
    const tough = (d: IsoDate) => state.moods[d]!.some((m) => TOUGH_MOODS.includes(m));
    const mw = moodDays.filter(isHit);
    const mo = moodDays.filter((d) => !isHit(d));
    if (mw.length >= INSIGHT_MIN_DAYS && mo.length >= INSIGHT_MIN_DAYS) {
      const x = mw.filter(tough).length / mw.length;
      const y = mo.filter(tough).length / mo.length;
      if (Math.abs(x - y) >= 0.25)
        out.push(`${c.emoji} Tough moods on ${pct(x)}% of ${what} vs ${pct(y)}% of other days.`);
    }
    const firstSleep = Object.keys(state.sleep).sort()[0];
    const nights = firstSleep
      ? logged.filter((d) => addDays(d, 1) >= firstSleep && addDays(d, 1) <= today)
      : [];
    const sw = nights.filter(isHit);
    const so = nights.filter((d) => !isHit(d));
    if (sw.length >= INSIGHT_MIN_DAYS && so.length >= INSIGHT_MIN_DAYS) {
      const bad = (d: IsoDate) => !!state.sleep[addDays(d, 1)];
      const x = sw.filter(bad).length / sw.length;
      const y = so.filter(bad).length / so.length;
      if (Math.abs(x - y) >= 0.2)
        out.push(`${c.emoji} A bad night after ${pct(x)}% of ${what} vs ${pct(y)}% of other days.`);
    }
  }
  return out;
}
