// Habits: the built-in and custom list, and how habits link to sleep, mood and cycle phase.

import { HABITS, HABIT_MIN_DAYS, HABIT_MIN_SPAN, MOODS, PHASES } from './catalog.ts';
import { cycleDayOf, phaseOf } from './cycle.ts';
import { addDays, diffDays } from './dates.ts';
import type { Analysis, Habit, IsoDate, Mood, Phase, PhaseId, State } from './types.ts';

export function allHabits(state: Pick<State, 'customHabits'>): Habit[] {
  return [...HABITS, ...state.customHabits.map((c) => ({ ...c, group: 'custom' as const }))];
}

export function activeHabits(state: Pick<State, 'customHabits' | 'hiddenHabits'>): Habit[] {
  return allHabits(state).filter((h) => !state.hiddenHabits.includes(h.id));
}

/** Something compared in the analysis: a habit at any level, or at a high level. */
export interface Factor {
  label: string;
  since?: IsoDate | null;
  /** True for the "high level" variant (e.g. 3+ cups). */
  top: boolean;
  has: (d: IsoDate) => boolean;
}

/**
 * Each habit at any level, and levelled habits also at a high level: their `heavy`
 * threshold (e.g. 3+ cups, so there are enough days to compare) or else their top level.
 */
export function habitFactors(state: State): Factor[] {
  const out: Factor[] = [];
  const level = (d: IsoDate, id: string) => state.habits[d]?.[id] ?? 0;
  for (const h of activeHabits(state)) {
    out.push({ label: `${h.emoji} ${h.label}`, since: h.since, top: false, has: (d) => !!level(d, h.id) });
    if (h.levels) {
      const top = h.heavy ? h.heavy.level : h.levels.length;
      const topLabel = h.heavy ? h.heavy.label : h.levels[top - 1];
      out.push({
        label: `${h.emoji} ${h.label} (${topLabel})`,
        since: h.since,
        top: true,
        has: (d) => level(d, h.id) >= top,
      });
    }
  }
  return out;
}

export interface Sample {
  day: IsoDate;
  phase: PhaseId;
}

export interface Comparison {
  /** Days with the factor that were compared. */
  n: number;
  /** How often the outcome happened on those days… */
  observed: number;
  /** …and how often days without it, in the same phases, would predict. */
  expected: number;
}

/**
 * How often `outcome` happens on days with a factor, compared with what days without it
 * in the same cycle phases would predict. Comparing within phases keeps a habit that
 * simply clusters in one phase (say, coffee in the week before a period) from being
 * blamed for that phase's effect.
 */
export function compareByPhase(
  samples: Sample[],
  has: (d: IsoDate) => boolean,
  outcome: (d: IsoDate) => boolean,
): Comparison | null {
  const by: Partial<Record<PhaseId, { w: number; wHit: number; o: number; oHit: number }>> = {};
  for (const s of samples) {
    const g = (by[s.phase] ??= { w: 0, wHit: 0, o: 0, oHit: 0 });
    const hit = outcome(s.day);
    if (has(s.day)) {
      g.w++;
      if (hit) g.wHit++;
    } else {
      g.o++;
      if (hit) g.oHit++;
    }
  }
  let n = 0;
  let hits = 0;
  let expected = 0;
  let others = 0;
  for (const g of Object.values(by)) {
    if (!g.w || !g.o) continue; // no comparison possible in this phase
    n += g.w;
    hits += g.wHit;
    others += g.o;
    expected += (g.w * g.oHit) / g.o;
  }
  if (n < HABIT_MIN_DAYS || others < HABIT_MIN_DAYS) return null;
  return { n, observed: hits / n, expected: expected / n };
}

/** Only clear differences are worth showing: 15+ points and 1.5× either way. */
export function notable(r: Comparison | null): r is Comparison {
  if (!r) return false;
  return (
    Math.abs(r.observed - r.expected) >= 0.15 &&
    (r.observed >= 1.5 * r.expected || r.observed <= r.expected / 1.5)
  );
}

export interface PhaseSpread {
  phase: Phase;
  rate: number;
  overall: number;
}

/** The phase where a factor is clearly most common, if any. */
export function phaseSpread(samples: Sample[], has: (d: IsoDate) => boolean): PhaseSpread | null {
  const days: Partial<Record<PhaseId, number>> = {};
  const hits: Partial<Record<PhaseId, number>> = {};
  let n = 0;
  for (const s of samples) {
    days[s.phase] = (days[s.phase] ?? 0) + 1;
    if (has(s.day)) {
      hits[s.phase] = (hits[s.phase] ?? 0) + 1;
      n++;
    }
  }
  if (n < HABIT_MIN_DAYS) return null;
  const overall = n / samples.length;
  const best = PHASES.filter((p) => (days[p.id] ?? 0) >= 5)
    .map((p) => ({ phase: p, count: hits[p.id] ?? 0, rate: (hits[p.id] ?? 0) / days[p.id]! }))
    .sort((x, y) => y.rate - x.rate)[0];
  if (!best || best.count < 3 || best.rate < 1.5 * overall) return null;
  return { phase: best.phase, rate: best.rate, overall };
}

export interface HabitInsights {
  span: number;
  count: number;
  ready: boolean;
  sleep: (Comparison & { f: Factor })[];
  mood: (Comparison & { f: Factor; mood: Mood })[];
  cycle: (PhaseSpread & { f: Factor })[];
}

/**
 * Links between habits and sleep, mood and cycle phase. Uses only days where habits were
 * logged, and starts after ~2 months of logging.
 */
export function habitInsights(state: State, a: Analysis, today: IsoDate): HabitInsights {
  const logged = Object.keys(state.habits)
    .filter((d) => d <= today)
    .sort();
  const span = logged.length ? diffDays(logged[0]!, today) + 1 : 0;
  const status: HabitInsights = { span, count: logged.length, ready: false, sleep: [], mood: [], cycle: [] };
  if (!a.last || span < HABIT_MIN_SPAN) return status;
  status.ready = true;

  const samples: Sample[] = [];
  for (const d of logged) {
    const cd = cycleDayOf(d, a.ps);
    if (cd) samples.push({ day: d, phase: phaseOf(cd, a) });
  }
  // A day's habits go with the night after it. Sleep is logged on the morning after, from
  // the first bad night logged; unlogged nights count as normal.
  const firstSleep = Object.keys(state.sleep).sort()[0];
  const sleepSamples = firstSleep
    ? samples.filter((s) => {
        const night = addDays(s.day, 1);
        return night >= firstSleep && night < today;
      })
    : [];
  const badNight = (d: IsoDate) => !!state.sleep[addDays(d, 1)];
  const moodSamples = samples.filter((s) => state.moods[s.day]);

  for (const f of habitFactors(state)) {
    // A habit added later only counts from the day it was added.
    const own = (list: Sample[]) => (f.since ? list.filter((s) => s.day >= f.since!) : list);
    const r = compareByPhase(own(sleepSamples), f.has, badNight);
    if (notable(r)) status.sleep.push({ f, ...r });
    for (const m of MOODS) {
      const rm = compareByPhase(own(moodSamples), f.has, (d) => state.moods[d]!.includes(m.id));
      if (notable(rm)) status.mood.push({ f, mood: m, ...rm });
    }
    if (!f.top) {
      const c = phaseSpread(own(samples), f.has);
      if (c) status.cycle.push({ f, ...c });
    }
  }
  const gap = (r: Comparison) => Math.abs(r.observed - r.expected);
  status.sleep.sort((x, y) => gap(y) - gap(x));
  status.mood.sort((x, y) => gap(y) - gap(x));
  status.cycle.sort((x, y) => y.rate / y.overall - x.rate / x.overall);
  return status;
}
