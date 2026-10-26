// Mood forecast for the next 7 days, from moods logged at the same point of past cycles.

import { MOOD_LOOKBACK, MOOD_MIN_ENTRIES, MOOD_MIN_SPAN } from './catalog.ts';
import { cycleDayOf, futureCycleDay } from './cycle.ts';
import { addDays, diffDays } from './dates.ts';
import type { Analysis, IsoDate, MoodId, State } from './types.ts';

export interface ForecastDay {
  date: IsoDate;
  cycleDay: number;
  /** Likely moods with how often they showed up on comparable days (%). */
  moods: { id: MoodId; pct: number }[];
}

export interface MoodForecast {
  /** Days since the first mood entry, and how many entries there are. */
  span: number;
  count: number;
  ready: boolean;
  days: ForecastDay[];
}

/**
 * For each upcoming day, look at the days logged on the same cycle day (±2 days, closer
 * days weigh more) in past cycles and estimate how often each mood showed up. A day can
 * have several moods, so each mood gets its own likelihood. Only runs once there are
 * ~2 months of mood history.
 */
export function moodForecast(moods: State['moods'], a: Analysis, today: IsoDate): MoodForecast {
  const entries = Object.entries(moods)
    .filter(([d]) => d <= today)
    .sort(([x], [y]) => (x < y ? -1 : 1));
  const first = entries[0]?.[0] ?? null;
  const span = first ? diffDays(first, today) + 1 : 0;
  const status: MoodForecast = { span, count: entries.length, ready: false, days: [] };
  if (!a.last || span < MOOD_MIN_SPAN || entries.length < MOOD_MIN_ENTRIES) return status;

  const L = a.cycleLen;
  const samples: { cd: number; moods: MoodId[] }[] = [];
  for (const [d, ms] of entries) {
    if (diffDays(d, today) > MOOD_LOOKBACK) continue;
    const cd = cycleDayOf(d, a.ps);
    if (cd) samples.push({ cd, moods: ms });
  }
  if (samples.length < MOOD_MIN_ENTRIES) return status;
  status.ready = true;

  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const cd = futureCycleDay(d, a);
    const score: Partial<Record<MoodId, number>> = {};
    let total = 0;
    for (const s of samples) {
      const raw = Math.abs(s.cd - cd);
      const dist = Math.min(raw, Math.abs(L - raw)); // cycles wrap around
      if (dist > 2) continue;
      const w = 3 - dist;
      for (const m of s.moods) score[m] = (score[m] ?? 0) + w;
      total += w;
    }
    // Moods present on at least 40% of comparable days (top 3), or the single most likely one.
    const ranked = (Object.entries(score) as [MoodId, number][])
      .map(([id, w]) => ({ id, pct: Math.round((100 * w) / total) }))
      .sort((x, y) => y.pct - x.pct);
    const likely = ranked.filter((r) => r.pct >= 40).slice(0, 3);
    status.days.push({
      date: d,
      cycleDay: cd,
      moods: total >= 3 ? (likely.length ? likely : ranked.slice(0, 1)) : [],
    });
  }
  return status;
}
